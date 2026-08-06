import { relations } from "drizzle-orm";
import { aiProviderConnections, userAiPreferences } from "./ai-connections";
import { accounts, sessions, users } from "./auth";
import { payments } from "./billing";
import { exampleGenerations } from "./generation-memory";
import { presentations } from "./presentation";
import { ragContext } from "./rag-context";
import { deckMemories, slideEmbeddings } from "./slide-memory";
import { promptEvents, sourceChunks } from "./source-memory";
import { feedbackMemories, styleMemories } from "./style-memory";

export const usersRelations = relations(users, ({ many, one }) => ({
	presentations: many(presentations),
	accounts: many(accounts),
	sessions: many(sessions),
	aiProviderConnections: many(aiProviderConnections),
	aiPreference: one(userAiPreferences),
}));

export const aiProviderConnectionsRelations = relations(aiProviderConnections, ({ one }) => ({
	user: one(users, {
		fields: [aiProviderConnections.userId],
		references: [users.id],
	}),
}));

export const userAiPreferencesRelations = relations(userAiPreferences, ({ one }) => ({
	user: one(users, {
		fields: [userAiPreferences.userId],
		references: [users.id],
	}),
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

export const paymentsRelations = relations(payments, ({ one }) => ({
	user: one(users, {
		fields: [payments.userId],
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
