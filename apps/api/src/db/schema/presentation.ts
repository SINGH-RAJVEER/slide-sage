import { jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const presentations = pgTable("presentations", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    prompt: text("prompt").notNull(),
    slidesData: jsonb("slides_data").notNull(),
    aiProvider: varchar("ai_provider", { length: 20 }),
    aiModel: varchar("ai_model", { length: 160 }),
    parentPresentationId: text("parent_presentation_id").references(
        // biome-ignore lint/suspicious/noExplicitAny: Drizzle circular reference
        (): any => presentations.id
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export type Presentation = typeof presentations.$inferSelect;
export type NewPresentation = typeof presentations.$inferInsert;
