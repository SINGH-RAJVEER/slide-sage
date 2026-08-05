import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const selectResults: unknown[][] = [];
const insertedValues: unknown[] = [];
const updatedValues: unknown[] = [];

const db = {
    select: mock(() => ({
        from: () => ({
            where: () => ({
                limit: async () => selectResults.shift() ?? [],
                orderBy: () => ({
                    limit: async () => selectResults.shift() ?? [],
                }),
            }),
        }),
    })),
    update: mock(() => ({
        set: (values: unknown) => {
            updatedValues.push(values);
            return { where: async () => undefined };
        },
    })),
    insert: mock(() => ({
        values: (values: unknown) => {
            insertedValues.push(values);
            return { onConflictDoUpdate: async () => undefined };
        },
    })),
    delete: mock(() => ({
        where: async () => ({ count: 0 }),
    })),
};

const semanticCacheEntries = {
    id: {},
    namespace: {},
    exactKey: {},
    variantHash: {},
    queryEmbedding: {},
    embeddingModel: {},
    queryMetadata: {},
    payload: {},
    expiresAt: {},
    hitCount: {},
    lastAccessedAt: {},
    createdAt: {},
};

mock.module("@/database", () => ({ db, semanticCacheEntries }));
mock.module("drizzle-orm", () => ({
    and: (...values: unknown[]) => values,
    cosineDistance: (...values: unknown[]) => values,
    desc: (value: unknown) => value,
    eq: (...values: unknown[]) => values,
    gt: (...values: unknown[]) => values,
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));
mock.module("../../services/rag.service", () => ({ RAGService: class {} }));

const { SemanticCacheService } = await import("../../services/semantic-cache.service");

describe("SemanticCacheService", () => {
    beforeEach(() => {
        selectResults.length = 0;
        insertedValues.length = 0;
        updatedValues.length = 0;
        db.select.mockClear();
        db.update.mockClear();
        db.insert.mockClear();
        process.env["SEMANTIC_CACHE_MODE"] = "serve";
    });

    afterEach(() => {
        delete process.env["SEMANTIC_CACHE_MODE"];
    });

    it("returns exact hits without generating an embedding", async () => {
        selectResults.push([{ id: "cache_1", payload: { value: "cached" } }]);
        const generateEmbedding = mock();
        const load = mock();
        const service = new SemanticCacheService(generateEmbedding);

        const result = await service.resolve({
            namespace: "outline",
            query: "AI infrastructure",
            variant: { slideCount: 5 },
            ttlMs: 1000,
            load,
            isCacheable: () => true,
            isValid: (value): value is { value: string } => Boolean(value),
        });

        expect(result).toEqual({
            payload: { value: "cached" },
            status: "exact-hit",
            similarity: 1,
        });
        expect(generateEmbedding).not.toHaveBeenCalled();
        expect(load).not.toHaveBeenCalled();
        expect(updatedValues).toHaveLength(1);
    });

    it("serves a semantic hit when hard query guards match", async () => {
        selectResults.push(
            [],
            [
                {
                    id: "cache_2",
                    payload: { value: "similar" },
                    queryMetadata: { numbers: ["2026"], temporalTerms: ["latest"] },
                    similarity: 0.97,
                },
            ]
        );
        const generateEmbedding = mock().mockResolvedValue({
            embedding: [0.1, 0.2],
            model: "embedding-model",
        });
        const service = new SemanticCacheService(generateEmbedding);

        const result = await service.resolve({
            namespace: "search",
            query: "latest AI market in 2026",
            variant: { freshness: "week" },
            ttlMs: 1000,
            load: mock(),
            isCacheable: () => true,
            isValid: (value): value is { value: string } => Boolean(value),
        });

        expect(result.status).toBe("semantic-hit");
        expect(result.payload).toEqual({ value: "similar" });
        expect(generateEmbedding).toHaveBeenCalledTimes(1);
    });

    it("rejects semantically similar candidates with different dates and stores the miss", async () => {
        selectResults.push(
            [],
            [
                {
                    id: "cache_3",
                    payload: { value: "stale" },
                    queryMetadata: { numbers: ["2025"], temporalTerms: ["latest"] },
                    similarity: 0.99,
                },
            ]
        );
        const load = mock().mockResolvedValue({ value: "fresh" });
        const service = new SemanticCacheService(
            mock().mockResolvedValue({ embedding: [0.1, 0.2], model: "embedding-model" })
        );

        const result = await service.resolve({
            namespace: "search",
            query: "latest AI market in 2026",
            variant: { freshness: "week" },
            ttlMs: 1000,
            load,
            isCacheable: () => true,
            isValid: (value): value is { value: string } => Boolean(value),
        });

        expect(result).toEqual({ payload: { value: "fresh" }, status: "miss" });
        expect(load).toHaveBeenCalledTimes(1);
        expect(insertedValues).toHaveLength(1);
    });
});
