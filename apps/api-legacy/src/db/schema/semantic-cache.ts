import {
    index,
    integer,
    jsonb,
    pgTable,
    timestamp,
    uniqueIndex,
    varchar,
    vector,
} from "drizzle-orm/pg-core";

export const semanticCacheEntries = pgTable(
    "semantic_cache_entries",
    {
        id: varchar("id", { length: 64 })
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        namespace: varchar("namespace", { length: 32 }).notNull(),
        exactKey: varchar("exact_key", { length: 64 }).notNull(),
        variantHash: varchar("variant_hash", { length: 64 }).notNull(),
        queryEmbedding: vector("query_embedding", { dimensions: 768 }).notNull(),
        embeddingModel: varchar("embedding_model", { length: 100 }).notNull(),
        queryMetadata: jsonb("query_metadata"),
        payload: jsonb("payload").notNull(),
        expiresAt: timestamp("expires_at").notNull(),
        hitCount: integer("hit_count").notNull().default(0),
        lastAccessedAt: timestamp("last_accessed_at"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => ({
        exactKeyIdx: uniqueIndex("semantic_cache_entries_namespace_exact_key_idx").on(
            table.namespace,
            table.exactKey
        ),
        variantExpiryIdx: index("semantic_cache_entries_variant_expiry_idx").on(
            table.namespace,
            table.variantHash,
            table.expiresAt
        ),
        embeddingIdx: index("semantic_cache_entries_embedding_idx").using(
            "hnsw",
            table.queryEmbedding.op("vector_cosine_ops")
        ),
    })
);

export type SemanticCacheEntry = typeof semanticCacheEntries.$inferSelect;
export type NewSemanticCacheEntry = typeof semanticCacheEntries.$inferInsert;
