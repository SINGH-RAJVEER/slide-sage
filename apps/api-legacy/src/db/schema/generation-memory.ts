import { index, jsonb, pgTable, text, timestamp, varchar, vector } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { presentations } from "./presentation";

export const slideTemplates = pgTable(
    "slide_templates",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        templateName: varchar("template_name", { length: 120 }).notNull(),
        templateDescription: text("template_description").notNull(),
        slideType: varchar("slide_type", { length: 100 }).notNull(),
        schemaHint: jsonb("schema_hint"),
        embedding: vector("embedding", { dimensions: 768 }),
        embeddingModel: varchar("embedding_model", { length: 100 }).notNull(),
        metadata: jsonb("metadata"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => ({
        templateNameIdx: index("slide_templates_template_name_idx").on(table.templateName),
        slideTypeIdx: index("slide_templates_slide_type_idx").on(table.slideType),
        embeddingIdx: index("slide_templates_embedding_idx").using(
            "hnsw",
            table.embedding.op("vector_cosine_ops")
        ),
    })
);

export const exampleGenerations = pgTable(
    "example_generations",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        presentationId: text("presentation_id").references(() => presentations.id, {
            onDelete: "cascade",
        }),
        prompt: text("prompt").notNull(),
        summary: text("summary").notNull(),
        outputJson: jsonb("output_json").notNull(),
        embedding: vector("embedding", { dimensions: 768 }),
        embeddingModel: varchar("embedding_model", { length: 100 }).notNull(),
        metadata: jsonb("metadata"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => ({
        userIdIdx: index("example_generations_user_id_idx").on(table.userId),
        presentationIdIdx: index("example_generations_presentation_id_idx").on(
            table.presentationId
        ),
        embeddingIdx: index("example_generations_embedding_idx").using(
            "hnsw",
            table.embedding.op("vector_cosine_ops")
        ),
    })
);

export const semanticCommands = pgTable(
    "semantic_commands",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        commandText: text("command_text").notNull(),
        intent: varchar("intent", { length: 100 }).notNull(),
        route: varchar("route", { length: 100 }).notNull(),
        embedding: vector("embedding", { dimensions: 768 }),
        embeddingModel: varchar("embedding_model", { length: 100 }).notNull(),
        metadata: jsonb("metadata"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => ({
        intentIdx: index("semantic_commands_intent_idx").on(table.intent),
        routeIdx: index("semantic_commands_route_idx").on(table.route),
        embeddingIdx: index("semantic_commands_embedding_idx").using(
            "hnsw",
            table.embedding.op("vector_cosine_ops")
        ),
    })
);

export type SlideTemplate = typeof slideTemplates.$inferSelect;
export type NewSlideTemplate = typeof slideTemplates.$inferInsert;
export type ExampleGeneration = typeof exampleGenerations.$inferSelect;
export type NewExampleGeneration = typeof exampleGenerations.$inferInsert;
export type SemanticCommand = typeof semanticCommands.$inferSelect;
export type NewSemanticCommand = typeof semanticCommands.$inferInsert;
