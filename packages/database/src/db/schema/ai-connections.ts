import { integer, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const aiProviderConnections = pgTable(
    "ai_provider_connections",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        provider: varchar("provider", { length: 20 }).notNull(),
        encryptedApiKey: text("encrypted_api_key").notNull(),
        encryptionIv: text("encryption_iv").notNull(),
        encryptionKeyVersion: integer("encryption_key_version").notNull(),
        keyLastFour: varchar("key_last_four", { length: 4 }).notNull(),
        status: varchar("status", { length: 20 }).notNull().default("valid"),
        validatedAt: timestamp("validated_at").notNull(),
        lastUsedAt: timestamp("last_used_at"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at")
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => ({
        userProviderUnique: unique("ai_provider_connections_user_provider_unique").on(
            table.userId,
            table.provider,
        ),
    }),
);

export const userAiPreferences = pgTable("user_ai_preferences", {
    userId: text("user_id")
        .primaryKey()
        .references(() => users.id, { onDelete: "cascade" }),
    selectedProvider: varchar("selected_provider", { length: 20 }).notNull(),
    selectedModel: varchar("selected_model", { length: 160 }).notNull(),
    updatedAt: timestamp("updated_at")
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export type AIProviderConnection = typeof aiProviderConnections.$inferSelect;
export type NewAIProviderConnection = typeof aiProviderConnections.$inferInsert;
export type UserAIPreference = typeof userAiPreferences.$inferSelect;
