import { relations } from "drizzle-orm";
import {
    boolean,
    date,
    index,
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
    isUnlimited: boolean("is_unlimited").notNull().default(false),
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
