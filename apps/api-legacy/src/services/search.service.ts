import type { ResearchOptions, Source } from "@slidesage/types";
import { abortReason, combineAbortSignal, throwIfAborted } from "../utils/abort";
import { logSafeError } from "../utils/safe-logging";
import { RAGService } from "./rag.service";
import { SemanticCacheService } from "./semantic-cache.service";

interface ExaSearchResult {
    url: string;
    title?: string | null;
    publishedDate?: string;
    author?: string;
    highlights?: string[];
    summary?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export class SearchService {
    private ragService: RAGService | null = null;
    private cacheService = new SemanticCacheService();
    private fetchImpl: typeof fetch;

    constructor(fetchImpl: typeof fetch = fetch) {
        this.fetchImpl = fetchImpl;
    }

    async webSearch(
        query: string,
        options: ResearchOptions,
        signal?: AbortSignal
    ): Promise<Source[]> {
        throwIfAborted(signal);
        if (!options.enabled) return [];

        const normalizedQuery = this.normalizeQuery(query);
        if (!normalizedQuery) return [];

        const maxResults = this.clampNumber(options.maxResults ?? 5, 1, 8);
        const maxAgeHours = this.resolveMaxAgeHours(options);
        const startPublishedDate =
            options.startPublishedDate ?? this.startPublishedDateForFreshness(options.freshness);

        if (maxAgeHours === 0) {
            return await this.searchExa(
                normalizedQuery,
                options,
                maxResults,
                maxAgeHours,
                startPublishedDate,
                signal
            );
        }

        const result = await this.cacheService.resolve<Source[]>({
            namespace: "search",
            query: normalizedQuery,
            variant: {
                version: 1,
                maxResults,
                maxAgeHours,
                includeDomains: this.normalizeDomains(options.includeDomains),
                excludeDomains: this.normalizeDomains(options.excludeDomains),
                startPublishedDate,
                endPublishedDate: options.endPublishedDate,
                freshness: options.freshness,
            },
            ttlMs: this.resolveCacheTtlMs(options, maxAgeHours),
            load: () =>
                this.searchExa(
                    normalizedQuery,
                    options,
                    maxResults,
                    maxAgeHours,
                    startPublishedDate,
                    signal
                ),
            isCacheable: (sources) => sources.length > 0,
            isValid: this.isSourceArray,
        });
        throwIfAborted(signal);
        console.info(`Search cache status=${result.status}`);
        return result.payload;
    }

    private async searchExa(
        normalizedQuery: string,
        options: ResearchOptions,
        maxResults: number,
        maxAgeHours: number | undefined,
        startPublishedDate: string | undefined,
        signal?: AbortSignal
    ): Promise<Source[]> {
        const apiKey = process.env["EXA_API_KEY"];
        if (!apiKey) {
            console.warn("Web research enabled but EXA_API_KEY is not set; skipping search.");
            return [];
        }

        const timeoutMs = this.positiveIntegerEnv("EXA_REQUEST_TIMEOUT_MS", 10_000);
        const combined = combineAbortSignal(signal, timeoutMs, "Exa search request timed out");
        try {
            const response = await this.fetchImpl("https://api.exa.ai/search", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": apiKey,
                },
                body: JSON.stringify({
                    query: normalizedQuery,
                    type: "auto",
                    numResults: maxResults,
                    includeDomains: options.includeDomains,
                    excludeDomains: options.excludeDomains,
                    startPublishedDate,
                    endPublishedDate: options.endPublishedDate,
                    contents: {
                        highlights: {
                            query: normalizedQuery,
                            maxCharacters: 1200,
                        },
                        summary: {
                            query: normalizedQuery,
                        },
                        maxAgeHours,
                    },
                }),
                signal: combined.signal,
            });
            if (!response.ok) {
                logSafeError("exa_search_rejected", new Error(`HTTP${response.status}`));
                return [];
            }
            const contentLength = Number(response.headers.get("content-length") ?? 0);
            if (contentLength > 512 * 1024) {
                await response.body?.cancel().catch(() => undefined);
                throw new Error("Exa response is too large");
            }
            const raw = await response.text();
            if (new TextEncoder().encode(raw).byteLength > 512 * 1024) {
                throw new Error("Exa response is too large");
            }
            const result = JSON.parse(raw) as { results?: unknown[] };
            throwIfAborted(signal);

            const retrievedAt = new Date().toISOString();
            const sources: Source[] = [];
            const results = Array.isArray(result.results)
                ? result.results.slice(0, maxResults)
                : [];

            for (const item of results) {
                if (!isRecord(item) || typeof item["url"] !== "string") continue;
                const resultItem = item as unknown as ExaSearchResult;
                const url = resultItem.url.trim().slice(0, 2048);
                if (!url || !this.isLikelyHttpUrl(url)) continue;

                const highlights = Array.isArray(resultItem.highlights)
                    ? resultItem.highlights
                          .filter((highlight): highlight is string => typeof highlight === "string")
                          .map((highlight) => highlight.trim().slice(0, 1200))
                          .filter(Boolean)
                          .slice(0, 8)
                    : [];
                const summary =
                    typeof resultItem.summary === "string"
                        ? resultItem.summary.trim().slice(0, 4000)
                        : "";
                const snippet = (summary || highlights[0])?.slice(0, 2000);

                sources.push({
                    url,
                    title:
                        typeof resultItem.title === "string"
                            ? resultItem.title.trim().slice(0, 500)
                            : undefined,
                    snippet,
                    retrieved_at: retrievedAt,
                    published_date:
                        typeof resultItem.publishedDate === "string"
                            ? resultItem.publishedDate.slice(0, 64)
                            : undefined,
                    author:
                        typeof resultItem.author === "string"
                            ? resultItem.author.trim().slice(0, 200)
                            : undefined,
                    highlights,
                    summary: summary || undefined,
                });
            }

            return sources;
        } catch (error) {
            if (signal?.aborted) throw abortReason(signal);
            logSafeError(combined.timedOut() ? "exa_search_timeout" : "exa_search_failed", error);
            return [];
        } finally {
            combined.dispose();
        }
    }

    private resolveCacheTtlMs(options: ResearchOptions, maxAgeHours: number | undefined): number {
        const configured = Number.parseInt(process.env["SEARCH_CACHE_TTL_SECONDS"] ?? "", 10);
        if (Number.isFinite(configured) && configured > 0) return configured * 1000;

        const ttlHours = {
            day: 0.25,
            week: 1,
            month: 6,
            year: 24,
        }[options.freshness ?? "week"];
        const cappedHours =
            maxAgeHours === undefined
                ? ttlHours
                : Math.min(ttlHours, Math.max(1 / 60, maxAgeHours));
        return cappedHours * 60 * 60 * 1000;
    }

    private normalizeDomains(domains: string[] | undefined): string[] | undefined {
        if (!domains?.length) return undefined;
        return Array.from(
            new Set(domains.map((domain) => domain.trim().toLowerCase()).filter(Boolean))
        ).sort();
    }

    private isSourceArray(value: unknown): value is Source[] {
        return (
            Array.isArray(value) &&
            value.length <= 8 &&
            value.every(
                (source) =>
                    source !== null &&
                    typeof source === "object" &&
                    typeof (source as Source).url === "string" &&
                    (source as Source).url.length <= 2048 &&
                    this.isLikelyHttpUrl((source as Source).url)
            )
        );
    }

    private resolveMaxAgeHours(options: ResearchOptions): number | undefined {
        if (typeof options.maxAgeHours === "number" && Number.isFinite(options.maxAgeHours)) {
            return Math.max(0, Math.floor(options.maxAgeHours));
        }

        switch (options.freshness) {
            case "day":
                return 24;
            case "week":
                return 24 * 7;
            case "month":
                return 24 * 30;
            case "year":
                return 24 * 365;
            default:
                return undefined;
        }
    }

    private startPublishedDateForFreshness(
        freshness: ResearchOptions["freshness"]
    ): string | undefined {
        if (!freshness) return undefined;

        const date = new Date();
        const daysBack = {
            day: 1,
            week: 7,
            month: 30,
            year: 365,
        }[freshness];

        date.setDate(date.getDate() - daysBack);
        return date.toISOString().slice(0, 10);
    }

    private normalizeQuery(query: string): string {
        const q = String(query ?? "").trim();
        if (!q) return "";
        return q.length > 400 ? q.slice(0, 400) : q;
    }

    private clampNumber(value: number, min: number, max: number): number {
        if (!Number.isFinite(value)) return min;
        return Math.min(max, Math.max(min, Math.floor(value)));
    }

    private positiveIntegerEnv(name: string, fallback: number): number {
        const parsed = Number.parseInt(process.env[name] ?? "", 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }

    private isLikelyHttpUrl(value: string): boolean {
        try {
            const u = new URL(value);
            return u.protocol === "https:" || u.protocol === "http:";
        } catch {
            return false;
        }
    }

    async storeSourceChunks(
        userId: string,
        query: string,
        sources: Source[] = [],
        presentationId?: string,
        signal?: AbortSignal
    ): Promise<void> {
        try {
            if (!this.ragService) {
                this.ragService = new RAGService();
            }

            await this.ragService.storeSourceChunks(userId, query, sources, presentationId, signal);
        } catch (error) {
            if (signal?.aborted) throw abortReason(signal);
            logSafeError("source_chunk_storage_failed", error);
            // Non-critical, continue without RAG
        }
    }
}
