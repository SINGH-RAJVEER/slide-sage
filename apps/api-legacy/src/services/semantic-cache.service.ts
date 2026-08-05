import { createHash } from "node:crypto";
import { and, cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
import { db, semanticCacheEntries } from "@/database";
import { logSafeError } from "../utils/safe-logging";
import { DEFAULT_EMBEDDING_MODEL } from "./rag/defaults";
import { RAGService } from "./rag.service";

export type SemanticCacheNamespace = "search" | "outline";
export type SemanticCacheStatus = "bypass" | "exact-hit" | "semantic-hit" | "miss";

interface QueryMetadata {
    numbers: string[];
    temporalTerms: string[];
}

interface EmbeddingResult {
    embedding: number[];
    model: string;
}

export interface SemanticCacheResolveParams<T> {
    namespace: SemanticCacheNamespace;
    query: string;
    variant: Record<string, unknown>;
    ttlMs: number;
    load: () => Promise<T>;
    isCacheable: (payload: T) => boolean;
    isValid: (payload: unknown) => payload is T;
    bypassRead?: boolean;
}

export interface SemanticCacheResolveResult<T> {
    payload: T;
    status: SemanticCacheStatus;
    similarity?: number;
}

type GenerateEmbedding = (text: string) => Promise<EmbeddingResult>;

const TEMPORAL_TERMS = new Set([
    "current",
    "currently",
    "latest",
    "newest",
    "now",
    "recent",
    "today",
    "tomorrow",
    "tonight",
    "yesterday",
]);

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stableValue(item)])
    );
}

function hash(value: unknown): string {
    return createHash("sha256")
        .update(JSON.stringify(stableValue(value)))
        .digest("hex");
}

function normalizeQuery(query: string): string {
    return query.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function queryMetadata(query: string): QueryMetadata {
    const normalized = normalizeQuery(query);
    const numbers = Array.from(normalized.matchAll(/\b\d+(?:[.,]\d+)?%?\b/g), (match) => match[0]);
    const temporalTerms = normalized.split(/[^a-z]+/).filter((term) => TEMPORAL_TERMS.has(term));

    return {
        numbers: Array.from(new Set(numbers)).sort(),
        temporalTerms: Array.from(new Set(temporalTerms)).sort(),
    };
}

function sameQueryMetadata(left: QueryMetadata, right: unknown): boolean {
    if (!right || typeof right !== "object") return false;
    const candidate = right as Partial<QueryMetadata>;
    return (
        JSON.stringify(left.numbers) === JSON.stringify(candidate.numbers ?? []) &&
        JSON.stringify(left.temporalTerms) === JSON.stringify(candidate.temporalTerms ?? [])
    );
}

function cacheMode(): "off" | "shadow" | "serve" {
    const value = process.env["SEMANTIC_CACHE_MODE"]?.trim().toLowerCase();
    if (value === "off" || value === "shadow") return value;
    return "serve";
}

function similarityThreshold(namespace: SemanticCacheNamespace): number {
    const configured = Number.parseFloat(
        process.env[
            namespace === "search"
                ? "SEARCH_CACHE_SIMILARITY_THRESHOLD"
                : "OUTLINE_CACHE_SIMILARITY_THRESHOLD"
        ] ?? "0.94"
    );
    return Number.isFinite(configured) && configured >= -1 && configured <= 1 ? configured : 0.94;
}

export class SemanticCacheService {
    private readonly generateEmbedding: GenerateEmbedding;

    constructor(generateEmbedding?: GenerateEmbedding) {
        if (generateEmbedding) {
            this.generateEmbedding = generateEmbedding;
            return;
        }

        const ragService = new RAGService();
        this.generateEmbedding = ragService.generateEmbedding.bind(ragService);
    }

    async resolve<T>(
        params: SemanticCacheResolveParams<T>
    ): Promise<SemanticCacheResolveResult<T>> {
        const mode = cacheMode();
        const normalizedQuery = normalizeQuery(params.query);
        if (mode === "off" || !normalizedQuery) {
            return { payload: await params.load(), status: "bypass" };
        }

        const embeddingModel = process.env["EMBEDDING_MODEL"] || DEFAULT_EMBEDDING_MODEL;
        const variantHash = hash({ ...params.variant, embeddingModel });
        const exactKey = hash({ namespace: params.namespace, normalizedQuery, variantHash });
        const metadata = queryMetadata(normalizedQuery);

        if (!params.bypassRead) {
            const exact = await this.findExact(params.namespace, exactKey);
            if (exact && params.isValid(exact.payload)) {
                await this.recordHit(exact.id);
                return { payload: exact.payload, status: "exact-hit", similarity: 1 };
            }
        }

        let embeddingResult: EmbeddingResult | undefined;
        try {
            embeddingResult = await this.generateEmbedding(normalizedQuery);
        } catch (error) {
            logSafeError(`semantic_cache_embedding_failed:${params.namespace}`, error);
        }

        if (!params.bypassRead && embeddingResult) {
            const candidate = await this.findSemantic(
                params.namespace,
                variantHash,
                embeddingResult,
                similarityThreshold(params.namespace),
                metadata
            );
            if (candidate && params.isValid(candidate.payload)) {
                if (mode === "serve") {
                    await this.recordHit(candidate.id);
                    return {
                        payload: candidate.payload,
                        status: "semantic-hit",
                        similarity: Number(candidate.similarity),
                    };
                }
                console.info(
                    `Semantic cache shadow match namespace=${params.namespace} similarity=${Number(candidate.similarity).toFixed(4)}`
                );
            }
        }

        const payload = await params.load();
        if (embeddingResult && params.isCacheable(payload)) {
            await this.store({
                namespace: params.namespace,
                exactKey,
                variantHash,
                embeddingResult,
                metadata,
                payload,
                ttlMs: params.ttlMs,
            });
        }

        return { payload, status: "miss" };
    }

    async deleteExpired(now = new Date()): Promise<number> {
        try {
            const result = await db
                .delete(semanticCacheEntries)
                .where(sql`${semanticCacheEntries.expiresAt} <= ${now}`);
            return result.count || 0;
        } catch (error) {
            logSafeError("semantic_cache_expiry_delete_failed", error);
            return 0;
        }
    }

    private async findExact(namespace: SemanticCacheNamespace, exactKey: string) {
        try {
            const rows = await db
                .select({
                    id: semanticCacheEntries.id,
                    payload: semanticCacheEntries.payload,
                })
                .from(semanticCacheEntries)
                .where(
                    and(
                        eq(semanticCacheEntries.namespace, namespace),
                        eq(semanticCacheEntries.exactKey, exactKey),
                        gt(semanticCacheEntries.expiresAt, new Date())
                    )
                )
                .limit(1);
            return rows[0];
        } catch (error) {
            logSafeError(`semantic_cache_exact_read_failed:${namespace}`, error);
            return undefined;
        }
    }

    private async findSemantic(
        namespace: SemanticCacheNamespace,
        variantHash: string,
        embeddingResult: EmbeddingResult,
        threshold: number,
        metadata: QueryMetadata
    ) {
        try {
            const similarity = sql<number>`1 - (${cosineDistance(
                semanticCacheEntries.queryEmbedding,
                embeddingResult.embedding
            )})`;
            const rows = await db
                .select({
                    id: semanticCacheEntries.id,
                    payload: semanticCacheEntries.payload,
                    queryMetadata: semanticCacheEntries.queryMetadata,
                    similarity,
                })
                .from(semanticCacheEntries)
                .where(
                    and(
                        eq(semanticCacheEntries.namespace, namespace),
                        eq(semanticCacheEntries.variantHash, variantHash),
                        eq(semanticCacheEntries.embeddingModel, embeddingResult.model),
                        gt(semanticCacheEntries.expiresAt, new Date()),
                        sql`${similarity} >= ${threshold}`
                    )
                )
                .orderBy(desc(similarity))
                .limit(5);

            return rows.find((row) => sameQueryMetadata(metadata, row.queryMetadata));
        } catch (error) {
            logSafeError(`semantic_cache_similarity_read_failed:${namespace}`, error);
            return undefined;
        }
    }

    private async recordHit(id: string): Promise<void> {
        try {
            await db
                .update(semanticCacheEntries)
                .set({
                    hitCount: sql`${semanticCacheEntries.hitCount} + 1`,
                    lastAccessedAt: new Date(),
                })
                .where(eq(semanticCacheEntries.id, id));
        } catch (error) {
            logSafeError("semantic_cache_hit_write_failed", error);
        }
    }

    private async store<T>(params: {
        namespace: SemanticCacheNamespace;
        exactKey: string;
        variantHash: string;
        embeddingResult: EmbeddingResult;
        metadata: QueryMetadata;
        payload: T;
        ttlMs: number;
    }): Promise<void> {
        try {
            const expiresAt = new Date(Date.now() + Math.max(1, params.ttlMs));
            await db
                .insert(semanticCacheEntries)
                .values({
                    namespace: params.namespace,
                    exactKey: params.exactKey,
                    variantHash: params.variantHash,
                    queryEmbedding: params.embeddingResult.embedding,
                    embeddingModel: params.embeddingResult.model,
                    queryMetadata: params.metadata,
                    payload: params.payload,
                    expiresAt,
                })
                .onConflictDoUpdate({
                    target: [semanticCacheEntries.namespace, semanticCacheEntries.exactKey],
                    set: {
                        variantHash: params.variantHash,
                        queryEmbedding: params.embeddingResult.embedding,
                        embeddingModel: params.embeddingResult.model,
                        queryMetadata: params.metadata,
                        payload: params.payload,
                        expiresAt,
                        hitCount: 0,
                        lastAccessedAt: null,
                        createdAt: new Date(),
                    },
                });
            await this.deleteExpired();
        } catch (error) {
            logSafeError(`semantic_cache_write_failed:${params.namespace}`, error);
        }
    }
}
