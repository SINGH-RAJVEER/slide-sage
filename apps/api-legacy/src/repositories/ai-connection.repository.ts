import type { AIModelSelection, AIProvider } from "@slidesage/types";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { type AIProviderConnection, aiProviderConnections, userAiPreferences } from "../db/schema";

export class AIConnectionRepository {
	async list(userId: string): Promise<AIProviderConnection[]> {
		return db.select().from(aiProviderConnections).where(eq(aiProviderConnections.userId, userId));
	}

	async find(userId: string, provider: AIProvider): Promise<AIProviderConnection | undefined> {
		const [connection] = await db
			.select()
			.from(aiProviderConnections)
			.where(
				and(eq(aiProviderConnections.userId, userId), eq(aiProviderConnections.provider, provider))
			);
		return connection;
	}

	async upsert(
		userId: string,
		provider: AIProvider,
		encrypted: {
			encryptedApiKey: string;
			encryptionIv: string;
			encryptionKeyVersion: number;
			keyLastFour: string;
		}
	): Promise<AIProviderConnection> {
		const now = new Date();
		const [connection] = await db
			.insert(aiProviderConnections)
			.values({
				userId,
				provider,
				...encrypted,
				status: "valid",
				validatedAt: now,
			})
			.onConflictDoUpdate({
				target: [aiProviderConnections.userId, aiProviderConnections.provider],
				set: {
					...encrypted,
					status: "valid",
					validatedAt: now,
					updatedAt: now,
				},
			})
			.returning();
		if (!connection) throw new Error("Failed to save AI provider connection");
		return connection;
	}

	async markInvalid(userId: string, provider: AIProvider): Promise<void> {
		await db
			.update(aiProviderConnections)
			.set({ status: "invalid", updatedAt: new Date() })
			.where(
				and(eq(aiProviderConnections.userId, userId), eq(aiProviderConnections.provider, provider))
			);
	}

	async markUsed(userId: string, provider: AIProvider): Promise<void> {
		await db
			.update(aiProviderConnections)
			.set({ lastUsedAt: new Date(), updatedAt: new Date() })
			.where(
				and(eq(aiProviderConnections.userId, userId), eq(aiProviderConnections.provider, provider))
			);
	}

	async delete(userId: string, provider: AIProvider): Promise<void> {
		await db.transaction(async (tx) => {
			await tx
				.delete(aiProviderConnections)
				.where(
					and(
						eq(aiProviderConnections.userId, userId),
						eq(aiProviderConnections.provider, provider)
					)
				);
			await tx
				.delete(userAiPreferences)
				.where(
					and(
						eq(userAiPreferences.userId, userId),
						eq(userAiPreferences.selectedProvider, provider)
					)
				);
		});
	}

	async getSelection(userId: string): Promise<AIModelSelection | null> {
		const [preference] = await db
			.select()
			.from(userAiPreferences)
			.where(eq(userAiPreferences.userId, userId));
		if (!preference) return null;
		return {
			provider: preference.selectedProvider as AIProvider,
			model: preference.selectedModel,
		};
	}

	async setSelection(userId: string, selection: AIModelSelection): Promise<void> {
		await db
			.insert(userAiPreferences)
			.values({
				userId,
				selectedProvider: selection.provider,
				selectedModel: selection.model,
			})
			.onConflictDoUpdate({
				target: userAiPreferences.userId,
				set: {
					selectedProvider: selection.provider,
					selectedModel: selection.model,
					updatedAt: new Date(),
				},
			});
	}
}
