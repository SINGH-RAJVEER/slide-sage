/**
 * RAG Service
 * Handles embedding generation, semantic memory storage, and retrieval.
 */

import type { Source } from "@slidesage/types";
import type { RagContext } from "@/database";
import { abortReason, combineAbortSignal, throwIfAborted } from "../utils/abort";
import { logSafeError } from "../utils/safe-logging";
import { DEFAULT_EMBEDDING_MODEL } from "./rag/defaults";
import {
	retrieveBestSemanticCommandIntent,
	retrieveDeckContexts,
	retrieveExampleContexts,
	retrieveFeedbackContexts,
	retrievePromptContexts,
	retrieveSlideContexts,
	retrieveSourceContexts,
	retrieveStyleContexts,
	retrieveTemplateContexts,
} from "./rag/retrieval";
import {
	seedDefaultSemanticCommandsIfMissing,
	seedDefaultSlideTemplatesIfMissing,
} from "./rag/seed";
import {
	cleanupOldEmbeddings as cleanupStoredEmbeddings,
	clearCurrentPresentationMemory,
	getPresentationRagContexts,
	storeDeckMemory,
	storeExampleGeneration,
	storeFeedbackMemory,
	storePromptEvent,
	storeRagContext,
	storeSlideMemories,
	storeSourceChunks,
	storeStyleMemory,
} from "./rag/storage";
import type {
	EmbeddingResult,
	MemorySourceType,
	RankedSource,
	SimilarContext,
	StorePresentationSemanticMemoryParams,
} from "./rag/types";
import {
	buildSourceChunkText,
	cosineSimilarity,
	fallbackPromptIntent,
	formatSourceLabel,
	normalizeText,
	truncateText,
} from "./rag/utils";

export type {
	EmbeddingResult,
	MemorySourceType,
	SimilarContext,
	StorePresentationSemanticMemoryParams,
} from "./rag/types";

/**
 * RAG Service for managing embeddings and context retrieval.
 */
export class RAGService {
	private embeddingModel: string;
	private defaultTemplatesSeeded = false;
	private defaultSemanticCommandsSeeded = false;

	constructor() {
		this.embeddingModel = process.env["EMBEDDING_MODEL"] || DEFAULT_EMBEDDING_MODEL;
	}

	/**
	 * Generate embeddings using OpenRouter.
	 */
	async generateEmbedding(text: string, signal?: AbortSignal): Promise<EmbeddingResult> {
		const timeoutMs = Number.parseInt(process.env["EMBEDDING_REQUEST_TIMEOUT_MS"] ?? "15000", 10);
		const combined = combineAbortSignal(
			signal,
			Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000,
			"Embedding request timed out"
		);
		try {
			throwIfAborted(signal);
			if (!text || text.trim().length === 0) {
				throw new Error("Text cannot be empty");
			}

			const requestBody = {
				model: this.embeddingModel,
				input: text,
				encoding_format: "float",
				dimensions: 768,
			};

			const apiKey = process.env["OPEN_ROUTER_API_KEY"];
			if (!apiKey) {
				throw new Error("OPEN_ROUTER_API_KEY is not set");
			}

			const embeddingsUrl =
				process.env["OPEN_ROUTER_EMBEDDINGS_URL"] || "https://openrouter.ai/api/v1/embeddings";

			const response = await fetch(embeddingsUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
					"HTTP-Referer": process.env["BASE_URL"] || "http://localhost:8000",
					"X-OpenRouter-Title": "Slide Sage",
				},
				body: JSON.stringify(requestBody),
				signal: combined.signal,
			});

			if (!response.ok) {
				await response.body?.cancel().catch(() => undefined);
				throw new Error(`Failed to generate embedding: ${response.statusText}`);
			}

			const contentLength = Number(response.headers.get("content-length") ?? 0);
			if (contentLength > 1024 * 1024) {
				await response.body?.cancel().catch(() => undefined);
				throw new Error("Embedding response is too large");
			}
			const raw = await response.text();
			if (new TextEncoder().encode(raw).byteLength > 1024 * 1024) {
				throw new Error("Embedding response is too large");
			}
			const data = JSON.parse(raw);

			if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
				throw new Error("Invalid embedding response format");
			}

			const embedding = data.data[0].embedding;

			if (!Array.isArray(embedding)) {
				throw new Error("Embedding is not an array");
			}

			return {
				embedding,
				model: this.embeddingModel,
			};
		} catch (error) {
			if (signal?.aborted) throw abortReason(signal);
			logSafeError("embedding_generation_failed", error);
			throw error;
		} finally {
			combined.dispose();
		}
	}

	/**
	 * Store source snippets/chunks from web search results.
	 */
	async storeSourceChunks(
		userId: string,
		query: string,
		sources: Source[],
		presentationId?: string,
		signal?: AbortSignal
	): Promise<void> {
		return storeSourceChunks(
			(text) => this.generateEmbedding(text, signal),
			userId,
			query,
			sources,
			presentationId
		);
	}

	/**
	 * Store all semantic memories produced by a saved generation or iteration.
	 */
	async storePresentationSemanticMemory(
		params: StorePresentationSemanticMemoryParams
	): Promise<void> {
		const normalizedPrompt = normalizeText(params.prompt);
		if (!normalizedPrompt || params.slides.length === 0) return;

		const embeddingGenerator = this.generateEmbedding.bind(this);
		const intentClassifier = this.classifyPromptIntentWithEmbedding.bind(this);
		const normalizedParams = { ...params, prompt: normalizedPrompt };

		await this.runMemoryTask("clear current presentation memory", () =>
			clearCurrentPresentationMemory(params.presentationId)
		);
		await this.runMemoryTask("prompt event", () =>
			storePromptEvent(embeddingGenerator, intentClassifier, normalizedParams)
		);
		await this.runMemoryTask("deck summary", () =>
			storeDeckMemory(embeddingGenerator, normalizedParams)
		);
		await this.runMemoryTask("slide summaries", () =>
			storeSlideMemories(embeddingGenerator, normalizedParams)
		);
		await this.runMemoryTask("style memory", () =>
			storeStyleMemory(embeddingGenerator, normalizedParams)
		);
		await this.runMemoryTask("example generation", () =>
			storeExampleGeneration(embeddingGenerator, normalizedParams)
		);

		if (params.operation === "iteration") {
			await this.runMemoryTask("feedback memory", () =>
				storeFeedbackMemory(embeddingGenerator, normalizedParams)
			);
		}

		if (params.sources?.length) {
			await this.runMemoryTask("source chunks", () =>
				storeSourceChunks(
					embeddingGenerator,
					params.userId,
					normalizedPrompt,
					params.sources ?? [],
					params.presentationId
				)
			);
		}
	}

	/**
	 * Rank fresh search sources with embeddings. This does not replace live search.
	 */
	async rankSourcesBySemanticRelevance(
		query: string,
		sources: Source[],
		limit = 8,
		signal?: AbortSignal
	): Promise<Source[]> {
		if (sources.length <= 1) return sources.slice(0, limit);

		try {
			const { embedding: queryEmbedding } = await this.generateEmbedding(query, signal);
			const ranked: RankedSource[] = [];

			for (const source of sources) {
				throwIfAborted(signal);
				const chunkText = buildSourceChunkText(query, source);
				if (!chunkText) continue;

				const { embedding } = await this.generateEmbedding(chunkText, signal);
				ranked.push({
					...source,
					similarity: cosineSimilarity(queryEmbedding, embedding),
				});
			}

			if (!ranked.length) return sources.slice(0, limit);

			return ranked
				.sort((a, b) => b.similarity - a.similarity)
				.slice(0, limit)
				.map(({ similarity: _similarity, ...source }) => source);
		} catch (error) {
			if (signal?.aborted) throw abortReason(signal);
			logSafeError("semantic_source_ranking_failed", error);
			return sources.slice(0, limit);
		}
	}

	/**
	 * Retrieve similar semantic contexts for a presentation.
	 */
	async retrieveSimilarContexts(
		userId: string,
		presentationId: string,
		query: string,
		topK = 8,
		similarityThreshold = 0.55,
		signal?: AbortSignal
	): Promise<SimilarContext[]> {
		try {
			await this.ensureDefaultSlideTemplatesSeeded();
			const { embedding } = await this.generateEmbedding(query, signal);
			const perTableLimit = Math.max(2, Math.ceil(topK / 2));

			const allContexts: SimilarContext[] = [
				...(await retrieveSlideContexts(
					userId,
					presentationId,
					embedding,
					perTableLimit,
					similarityThreshold
				)),
				...(await retrieveDeckContexts(
					userId,
					presentationId,
					embedding,
					perTableLimit,
					similarityThreshold
				)),
				...(await retrievePromptContexts(
					userId,
					presentationId,
					embedding,
					perTableLimit,
					similarityThreshold
				)),
				...(await retrieveSourceContexts(
					userId,
					presentationId,
					embedding,
					perTableLimit,
					similarityThreshold
				)),
				...(await retrieveTemplateContexts(
					this.embeddingModel,
					embedding,
					perTableLimit,
					similarityThreshold
				)),
				...(await retrieveExampleContexts(userId, embedding, perTableLimit, similarityThreshold)),
				...(await retrieveStyleContexts(
					userId,
					presentationId,
					embedding,
					perTableLimit,
					similarityThreshold
				)),
				...(await retrieveFeedbackContexts(
					userId,
					presentationId,
					embedding,
					perTableLimit,
					similarityThreshold
				)),
			];

			return allContexts.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
		} catch (error) {
			logSafeError("similar_context_read_failed", error);
			return [];
		}
	}

	/**
	 * Store RAG context for a presentation.
	 */
	async storeRagContext(
		presentationId: string,
		userId: string,
		sourceType: MemorySourceType,
		retrievedContext: string,
		sourceId?: string,
		similarityScore?: number
	): Promise<RagContext | null> {
		return storeRagContext(
			presentationId,
			userId,
			sourceType,
			retrievedContext,
			sourceId,
			similarityScore
		);
	}

	/**
	 * Get all RAG contexts for a presentation.
	 */
	async getPresentationRagContexts(presentationId: string, limit = 10): Promise<RagContext[]> {
		return getPresentationRagContexts(presentationId, limit);
	}

	/**
	 * Build formatted context string for an iteration prompt.
	 */
	async buildRagContextString(
		userId: string,
		presentationId: string,
		query: string,
		signal?: AbortSignal
	): Promise<string> {
		try {
			const similarContexts = await this.retrieveSimilarContexts(
				userId,
				presentationId,
				query,
				8,
				0.55,
				signal
			);

			if (similarContexts.length === 0) {
				return "";
			}

			for (const context of similarContexts) {
				await this.storeRagContext(
					presentationId,
					userId,
					context.sourceType,
					context.context,
					context.sourceId,
					context.similarity
				);
			}

			const contextLines = similarContexts.map((ctx, index) => {
				const similarity = (ctx.similarity * 100).toFixed(1);
				return `${index + 1}. ${formatSourceLabel(ctx.sourceType)} (${similarity}% similarity):\n${truncateText(ctx.context, 1400)}`;
			});

			return `## RELEVANT SEMANTIC MEMORY:\n\n${contextLines.join("\n\n")}\n\n`;
		} catch (error) {
			if (signal?.aborted) throw abortReason(signal);
			logSafeError("rag_context_build_failed", error);
			return "";
		}
	}

	/**
	 * Build reusable memory for a new generation request.
	 */
	async buildGenerationMemoryContextString(
		userId: string,
		query: string,
		signal?: AbortSignal
	): Promise<string> {
		try {
			await this.ensureDefaultSlideTemplatesSeeded();
			const { embedding } = await this.generateEmbedding(query, signal);
			const contexts = [
				...(await retrieveTemplateContexts(this.embeddingModel, embedding, 3, 0.45)),
				...(await retrieveExampleContexts(userId, embedding, 2, 0.5)),
				...(await retrieveStyleContexts(userId, undefined, embedding, 2, 0.45)),
			]
				.sort((a, b) => b.similarity - a.similarity)
				.slice(0, 5);

			if (!contexts.length) return "";

			const lines = contexts.map((ctx, index) => {
				const similarity = (ctx.similarity * 100).toFixed(1);
				return `${index + 1}. ${formatSourceLabel(ctx.sourceType)} (${similarity}% similarity):\n${truncateText(ctx.context, 1200)}`;
			});

			return `## RELEVANT GENERATION MEMORY:\n\n${lines.join("\n\n")}\n\n`;
		} catch (error) {
			if (signal?.aborted) throw abortReason(signal);
			logSafeError("generation_memory_build_failed", error);
			return "";
		}
	}

	/**
	 * Clean up old embeddings for a user.
	 */
	async cleanupOldEmbeddings(userId: string, daysToKeep = 30): Promise<number> {
		try {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
			return await cleanupStoredEmbeddings(userId, cutoffDate);
		} catch (error) {
			logSafeError("embedding_cleanup_failed", error);
			return 0;
		}
	}

	private async classifyPromptIntentWithEmbedding(
		embedding: number[],
		prompt: string
	): Promise<string> {
		try {
			await this.ensureDefaultSemanticCommandsSeeded();
			const match = await retrieveBestSemanticCommandIntent(this.embeddingModel, embedding);

			if (match && Number(match.similarity) >= 0.45) {
				return match.intent;
			}
		} catch (error) {
			logSafeError("semantic_command_classification_failed", error);
		}

		return fallbackPromptIntent(prompt);
	}

	private async ensureDefaultSlideTemplatesSeeded(): Promise<void> {
		if (this.defaultTemplatesSeeded) return;

		try {
			await seedDefaultSlideTemplatesIfMissing(
				this.generateEmbedding.bind(this),
				this.embeddingModel
			);
			this.defaultTemplatesSeeded = true;
		} catch (error) {
			logSafeError("slide_template_seed_failed", error);
		}
	}

	private async ensureDefaultSemanticCommandsSeeded(): Promise<void> {
		if (this.defaultSemanticCommandsSeeded) return;

		try {
			await seedDefaultSemanticCommandsIfMissing(
				this.generateEmbedding.bind(this),
				this.embeddingModel
			);
			this.defaultSemanticCommandsSeeded = true;
		} catch (error) {
			logSafeError("semantic_command_seed_failed", error);
		}
	}

	private async runMemoryTask(name: string, task: () => Promise<unknown>): Promise<void> {
		try {
			await task();
		} catch (error) {
			logSafeError(`semantic_memory_task_failed:${name}`, error);
		}
	}
}
