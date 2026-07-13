import { index, jsonb, pgTable, text, timestamp, varchar, vector } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { presentations } from "./presentation";

export const styleMemories = pgTable(
    "style_memories",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        presentationId: text("presentation_id").references(() => presentations.id, {
            onDelete: "cascade",
        }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        content: text("content").notNull(),
        embedding: vector("embedding", { dimensions: 768 }),
        embeddingModel: varchar("embedding_model", { length: 100 }).notNull(),
        metadata: jsonb("metadata"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => ({
        presentationIdIdx: index("style_memories_presentation_id_idx").on(table.presentationId),
        userIdIdx: index("style_memories_user_id_idx").on(table.userId),
        embeddingIdx: index("style_memories_embedding_idx").using(
            "hnsw",
            table.embedding.op("vector_cosine_ops"),
        ),
    }),
);

export const feedbackMemories = pgTable(
    "feedback_memories",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        presentationId: text("presentation_id")
            .notNull()
            .references(() => presentations.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        feedbackText: text("feedback_text").notNull(),
        outcome: varchar("outcome", { length: 50 }).notNull(),
        embedding: vector("embedding", { dimensions: 768 }),
        embeddingModel: varchar("embedding_model", { length: 100 }).notNull(),
        metadata: jsonb("metadata"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => ({
        presentationIdIdx: index("feedback_memories_presentation_id_idx").on(table.presentationId),
        userIdIdx: index("feedback_memories_user_id_idx").on(table.userId),
        outcomeIdx: index("feedback_memories_outcome_idx").on(table.outcome),
        embeddingIdx: index("feedback_memories_embedding_idx").using(
            "hnsw",
            table.embedding.op("vector_cosine_ops"),
        ),
    }),
);

export type StyleMemory = typeof styleMemories.$inferSelect;
export type NewStyleMemory = typeof styleMemories.$inferInsert;
export type FeedbackMemory = typeof feedbackMemories.$inferSelect;
export type NewFeedbackMemory = typeof feedbackMemories.$inferInsert;
