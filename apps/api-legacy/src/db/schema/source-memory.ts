import { index, jsonb, pgTable, text, timestamp, varchar, vector } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { presentations } from "./presentation";

export const sourceChunks = pgTable(
	"source_chunks",
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
		sourceUrl: text("source_url").notNull(),
		title: text("title"),
		publishedAt: timestamp("published_at"),
		fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
		chunkText: text("chunk_text").notNull(),
		embedding: vector("embedding", { dimensions: 768 }),
		embeddingModel: varchar("embedding_model", { length: 100 }).notNull(),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => ({
		presentationIdIdx: index("source_chunks_presentation_id_idx").on(table.presentationId),
		userIdIdx: index("source_chunks_user_id_idx").on(table.userId),
		sourceUrlIdx: index("source_chunks_source_url_idx").on(table.sourceUrl),
		fetchedAtIdx: index("source_chunks_fetched_at_idx").on(table.fetchedAt),
		embeddingIdx: index("source_chunks_embedding_idx").using(
			"hnsw",
			table.embedding.op("vector_cosine_ops")
		),
	})
);

export const promptEvents = pgTable(
	"prompt_events",
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
		userPrompt: text("user_prompt").notNull(),
		interpretedIntent: varchar("interpreted_intent", { length: 100 }).notNull(),
		embedding: vector("embedding", { dimensions: 768 }),
		embeddingModel: varchar("embedding_model", { length: 100 }).notNull(),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => ({
		presentationIdIdx: index("prompt_events_presentation_id_idx").on(table.presentationId),
		userIdIdx: index("prompt_events_user_id_idx").on(table.userId),
		interpretedIntentIdx: index("prompt_events_interpreted_intent_idx").on(table.interpretedIntent),
		embeddingIdx: index("prompt_events_embedding_idx").using(
			"hnsw",
			table.embedding.op("vector_cosine_ops")
		),
	})
);

export type SourceChunk = typeof sourceChunks.$inferSelect;
export type NewSourceChunk = typeof sourceChunks.$inferInsert;
export type PromptEvent = typeof promptEvents.$inferSelect;
export type NewPromptEvent = typeof promptEvents.$inferInsert;
