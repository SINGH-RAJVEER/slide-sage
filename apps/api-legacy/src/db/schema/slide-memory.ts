import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	varchar,
	vector,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { presentations } from "./presentation";

export const slideEmbeddings = pgTable(
	"slide_embeddings",
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
		slideId: text("slide_id").notNull(),
		slideIndex: integer("slide_index").notNull(),
		slideType: varchar("slide_type", { length: 100 }).notNull(),
		title: text("title"),
		summary: text("summary").notNull(),
		slideJson: jsonb("slide_json").notNull(),
		embedding: vector("embedding", { dimensions: 768 }),
		embeddingModel: varchar("embedding_model", { length: 100 }).notNull(),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => ({
		presentationIdIdx: index("slide_embeddings_presentation_id_idx").on(table.presentationId),
		userIdIdx: index("slide_embeddings_user_id_idx").on(table.userId),
		presentationSlideIdx: index("slide_embeddings_presentation_slide_idx").on(
			table.presentationId,
			table.slideIndex
		),
		embeddingIdx: index("slide_embeddings_embedding_idx").using(
			"hnsw",
			table.embedding.op("vector_cosine_ops")
		),
	})
);

export const deckMemories = pgTable(
	"deck_memories",
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
		memoryType: varchar("memory_type", { length: 80 }).notNull(),
		content: text("content").notNull(),
		embedding: vector("embedding", { dimensions: 768 }),
		embeddingModel: varchar("embedding_model", { length: 100 }).notNull(),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => ({
		presentationIdIdx: index("deck_memories_presentation_id_idx").on(table.presentationId),
		userIdIdx: index("deck_memories_user_id_idx").on(table.userId),
		memoryTypeIdx: index("deck_memories_memory_type_idx").on(table.memoryType),
		embeddingIdx: index("deck_memories_embedding_idx").using(
			"hnsw",
			table.embedding.op("vector_cosine_ops")
		),
	})
);

export type SlideEmbedding = typeof slideEmbeddings.$inferSelect;
export type NewSlideEmbedding = typeof slideEmbeddings.$inferInsert;
export type DeckMemory = typeof deckMemories.$inferSelect;
export type NewDeckMemory = typeof deckMemories.$inferInsert;
