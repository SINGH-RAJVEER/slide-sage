import { index, jsonb, pgTable, real, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { presentations } from "./presentation";

export const ragContext = pgTable(
	"rag_context",
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
		sourceType: varchar("source_type", { length: 50 }).notNull(),
		sourceId: text("source_id"),
		retrievedContext: text("retrieved_context").notNull(),
		similarityScore: real("similarity_score"),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => ({
		presentationIdIdx: index("rag_context_presentation_id_idx").on(table.presentationId),
		userIdIdx: index("rag_context_user_id_idx").on(table.userId),
		sourceTypeIdx: index("rag_context_source_type_idx").on(table.sourceType),
	})
);

export type RagContext = typeof ragContext.$inferSelect;
export type NewRagContext = typeof ragContext.$inferInsert;
