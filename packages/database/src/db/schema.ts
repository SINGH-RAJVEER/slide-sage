import { relations } from "drizzle-orm";
import {
    boolean,
    date,
    index,
    integer,
    jsonb,
    pgTable,
    real,
    text,
    timestamp,
    varchar,
    vector,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
    id: text("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),

    slideTokens: real("slide_tokens").notNull().default(50.0),
    lastLoginDate: date("last_login_date", { mode: "date" }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export const accounts = pgTable("accounts", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: varchar("provider_id", { length: 100 }).notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export const sessions = pgTable("sessions", {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export const verifications = pgTable("verifications", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

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
    parentPresentationId: text("parent_presentation_id").references(
        // biome-ignore lint/suspicious/noExplicitAny: Drizzle circular reference
        (): any => presentations.id,
    ),

    // Timestamps
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
    presentations: many(presentations),
    accounts: many(accounts),
    sessions: many(sessions),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
    user: one(users, {
        fields: [accounts.userId],
        references: [users.id],
    }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
    user: one(users, {
        fields: [sessions.userId],
        references: [users.id],
    }),
}));

export const presentationsRelations = relations(presentations, ({ one, many }) => ({
    user: one(users, {
        fields: [presentations.userId],
        references: [users.id],
    }),
    parentPresentation: one(presentations, {
        fields: [presentations.parentPresentationId],
        references: [presentations.id],
        relationName: "iterations",
    }),
    iterations: many(presentations, {
        relationName: "iterations",
    }),
}));

export const payments = pgTable("payments", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    razorpayOrderId: text("razorpay_order_id").notNull().unique(),
    razorpayPaymentId: text("razorpay_payment_id").unique(),
    amountPaise: integer("amount_paise").notNull(),
    tokensGranted: real("tokens_granted").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("created"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

// RAG Embeddings Tables

// Search embeddings - stores user search queries and their embeddings
export const searchEmbeddings = pgTable(
    "search_embeddings",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        searchQuery: text("search_query").notNull(),
        embedding: vector("embedding", { dimensions: 768 }),
        embeddingModel: varchar("embedding_model", { length: 100 }).notNull(),
        metadata: jsonb("metadata"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => ({
        userIdIdx: index("search_embeddings_user_id_idx").on(table.userId),
        embeddingIdx: index("search_embeddings_embedding_idx").using(
            "hnsw",
            table.embedding.op("vector_cosine_ops"),
        ),
    }),
);

// Presentation iteration embeddings - stores presentation content and iteration prompts
export const presentationEmbeddings = pgTable(
    "presentation_embeddings",
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
        iterationPrompt: text("iteration_prompt").notNull(),
        presentationContent: text("presentation_content"), // Serialized slides summary
        embedding: vector("embedding", { dimensions: 768 }),
        embeddingModel: varchar("embedding_model", { length: 100 }).notNull(),
        metadata: jsonb("metadata"), // Can store slide count, theme, etc.
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => ({
        presentationIdIdx: index("presentation_embeddings_presentation_id_idx").on(
            table.presentationId,
        ),
        userIdIdx: index("presentation_embeddings_user_id_idx").on(table.userId),
        embeddingIdx: index("presentation_embeddings_embedding_idx").using(
            "hnsw",
            table.embedding.op("vector_cosine_ops"),
        ),
    }),
);

// RAG context - stores retrieved contexts for presentations
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
        sourceType: varchar("source_type", { length: 50 }).notNull(), // 'search' | 'iteration' | 'presentation'
        sourceId: text("source_id"), // Reference to search_embeddings or presentation_embeddings
        retrievedContext: text("retrieved_context").notNull(),
        similarityScore: real("similarity_score"), // Cosine similarity score
        metadata: jsonb("metadata"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => ({
        presentationIdIdx: index("rag_context_presentation_id_idx").on(table.presentationId),
        userIdIdx: index("rag_context_user_id_idx").on(table.userId),
        sourceTypeIdx: index("rag_context_source_type_idx").on(table.sourceType),
    }),
);

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
            table.slideIndex,
        ),
        embeddingIdx: index("slide_embeddings_embedding_idx").using(
            "hnsw",
            table.embedding.op("vector_cosine_ops"),
        ),
    }),
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
            table.embedding.op("vector_cosine_ops"),
        ),
    }),
);

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
            table.embedding.op("vector_cosine_ops"),
        ),
    }),
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
        interpretedIntentIdx: index("prompt_events_interpreted_intent_idx").on(
            table.interpretedIntent,
        ),
        embeddingIdx: index("prompt_events_embedding_idx").using(
            "hnsw",
            table.embedding.op("vector_cosine_ops"),
        ),
    }),
);

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
            table.embedding.op("vector_cosine_ops"),
        ),
    }),
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
        embeddingIdx: index("example_generations_embedding_idx").using(
            "hnsw",
            table.embedding.op("vector_cosine_ops"),
        ),
    }),
);

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
            table.embedding.op("vector_cosine_ops"),
        ),
    }),
);

export const paymentsRelations = relations(payments, ({ one }) => ({
    user: one(users, {
        fields: [payments.userId],
        references: [users.id],
    }),
}));

// Relations
export const searchEmbeddingsRelations = relations(searchEmbeddings, ({ one }) => ({
    user: one(users, {
        fields: [searchEmbeddings.userId],
        references: [users.id],
    }),
}));

export const presentationEmbeddingsRelations = relations(presentationEmbeddings, ({ one }) => ({
    presentation: one(presentations, {
        fields: [presentationEmbeddings.presentationId],
        references: [presentations.id],
    }),
    user: one(users, {
        fields: [presentationEmbeddings.userId],
        references: [users.id],
    }),
}));

export const ragContextRelations = relations(ragContext, ({ one }) => ({
    presentation: one(presentations, {
        fields: [ragContext.presentationId],
        references: [presentations.id],
    }),
    user: one(users, {
        fields: [ragContext.userId],
        references: [users.id],
    }),
}));

export const slideEmbeddingsRelations = relations(slideEmbeddings, ({ one }) => ({
    presentation: one(presentations, {
        fields: [slideEmbeddings.presentationId],
        references: [presentations.id],
    }),
    user: one(users, {
        fields: [slideEmbeddings.userId],
        references: [users.id],
    }),
}));

export const deckMemoriesRelations = relations(deckMemories, ({ one }) => ({
    presentation: one(presentations, {
        fields: [deckMemories.presentationId],
        references: [presentations.id],
    }),
    user: one(users, {
        fields: [deckMemories.userId],
        references: [users.id],
    }),
}));

export const sourceChunksRelations = relations(sourceChunks, ({ one }) => ({
    presentation: one(presentations, {
        fields: [sourceChunks.presentationId],
        references: [presentations.id],
    }),
    user: one(users, {
        fields: [sourceChunks.userId],
        references: [users.id],
    }),
}));

export const promptEventsRelations = relations(promptEvents, ({ one }) => ({
    presentation: one(presentations, {
        fields: [promptEvents.presentationId],
        references: [presentations.id],
    }),
    user: one(users, {
        fields: [promptEvents.userId],
        references: [users.id],
    }),
}));

export const exampleGenerationsRelations = relations(exampleGenerations, ({ one }) => ({
    user: one(users, {
        fields: [exampleGenerations.userId],
        references: [users.id],
    }),
}));

export const styleMemoriesRelations = relations(styleMemories, ({ one }) => ({
    presentation: one(presentations, {
        fields: [styleMemories.presentationId],
        references: [presentations.id],
    }),
    user: one(users, {
        fields: [styleMemories.userId],
        references: [users.id],
    }),
}));

export const feedbackMemoriesRelations = relations(feedbackMemories, ({ one }) => ({
    presentation: one(presentations, {
        fields: [feedbackMemories.presentationId],
        references: [presentations.id],
    }),
    user: one(users, {
        fields: [feedbackMemories.userId],
        references: [users.id],
    }),
}));

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;
export type Presentation = typeof presentations.$inferSelect;
export type NewPresentation = typeof presentations.$inferInsert;
export type SearchEmbedding = typeof searchEmbeddings.$inferSelect;
export type NewSearchEmbedding = typeof searchEmbeddings.$inferInsert;
export type PresentationEmbedding = typeof presentationEmbeddings.$inferSelect;
export type NewPresentationEmbedding = typeof presentationEmbeddings.$inferInsert;
export type RagContext = typeof ragContext.$inferSelect;
export type NewRagContext = typeof ragContext.$inferInsert;
export type SlideEmbedding = typeof slideEmbeddings.$inferSelect;
export type NewSlideEmbedding = typeof slideEmbeddings.$inferInsert;
export type DeckMemory = typeof deckMemories.$inferSelect;
export type NewDeckMemory = typeof deckMemories.$inferInsert;
export type SourceChunk = typeof sourceChunks.$inferSelect;
export type NewSourceChunk = typeof sourceChunks.$inferInsert;
export type PromptEvent = typeof promptEvents.$inferSelect;
export type NewPromptEvent = typeof promptEvents.$inferInsert;
export type SlideTemplate = typeof slideTemplates.$inferSelect;
export type NewSlideTemplate = typeof slideTemplates.$inferInsert;
export type ExampleGeneration = typeof exampleGenerations.$inferSelect;
export type NewExampleGeneration = typeof exampleGenerations.$inferInsert;
export type StyleMemory = typeof styleMemories.$inferSelect;
export type NewStyleMemory = typeof styleMemories.$inferInsert;
export type FeedbackMemory = typeof feedbackMemories.$inferSelect;
export type NewFeedbackMemory = typeof feedbackMemories.$inferInsert;
export type SemanticCommand = typeof semanticCommands.$inferSelect;
export type NewSemanticCommand = typeof semanticCommands.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
