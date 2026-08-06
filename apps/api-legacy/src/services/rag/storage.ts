import { PRESENTATION_SCHEMA_VERSION, type PresentationJSON, type Source } from "@slidesage/types";
import { and, desc, eq, sql } from "drizzle-orm";
import {
	db,
	deckMemories,
	exampleGenerations,
	feedbackMemories,
	promptEvents,
	type RagContext,
	ragContext,
	slideEmbeddings,
	sourceChunks,
	styleMemories,
} from "@/database";
import { logSafeError } from "../../utils/safe-logging";
import type {
	GenerateEmbedding,
	MemorySourceType,
	PromptIntentClassifier,
	StorePresentationSemanticMemoryParams,
} from "./types";
import {
	buildDeckSummary,
	buildSlideSummary,
	buildSourceChunkText,
	getSlideId,
	normalizeText,
	parseDate,
	truncateText,
} from "./utils";

export async function storeSourceChunks(
	generateEmbedding: GenerateEmbedding,
	userId: string,
	query: string,
	sources: Source[],
	presentationId?: string
): Promise<void> {
	if (!sources.length) return;

	for (const [index, source] of sources.entries()) {
		const chunkText = buildSourceChunkText(query, source);
		if (!chunkText) continue;

		try {
			const { embedding, model } = await generateEmbedding(chunkText);
			await db.insert(sourceChunks).values({
				presentationId,
				userId,
				sourceUrl: source.url,
				title: source.title,
				publishedAt: parseDate(source.published_date),
				fetchedAt: parseDate(source.retrieved_at) ?? new Date(),
				chunkText,
				embedding,
				embeddingModel: model,
				metadata: {
					sourceIndex: index,
					query: truncateText(query, 500),
					retrievedAt: source.retrieved_at,
				},
			});
		} catch (error) {
			logSafeError("rag_source_chunk_write_failed", error);
		}
	}
}

export async function storeRagContext(
	presentationId: string,
	userId: string,
	sourceType: MemorySourceType,
	retrievedContext: string,
	sourceId?: string,
	similarityScore?: number
): Promise<RagContext | null> {
	try {
		const result = await db
			.insert(ragContext)
			.values({
				presentationId,
				userId,
				sourceType,
				sourceId,
				retrievedContext,
				similarityScore,
				metadata: {
					timestamp: new Date().toISOString(),
				},
			})
			.returning();

		return result[0] || null;
	} catch (error) {
		logSafeError("rag_context_write_failed", error);
		return null;
	}
}

export async function getPresentationRagContexts(
	presentationId: string,
	limit = 10
): Promise<RagContext[]> {
	try {
		return await db
			.select()
			.from(ragContext)
			.where(eq(ragContext.presentationId, presentationId))
			.orderBy(desc(ragContext.createdAt))
			.limit(limit);
	} catch (error) {
		logSafeError("rag_context_read_failed", error);
		return [];
	}
}

export async function clearCurrentPresentationMemory(presentationId: string): Promise<void> {
	await db.delete(slideEmbeddings).where(eq(slideEmbeddings.presentationId, presentationId));
	await db.delete(deckMemories).where(eq(deckMemories.presentationId, presentationId));
	await db.delete(styleMemories).where(eq(styleMemories.presentationId, presentationId));
	await db.delete(sourceChunks).where(eq(sourceChunks.presentationId, presentationId));
}

export async function storePromptEvent(
	generateEmbedding: GenerateEmbedding,
	classifyPromptIntent: PromptIntentClassifier,
	params: StorePresentationSemanticMemoryParams
): Promise<void> {
	const prompt = normalizeText(params.prompt);
	if (!prompt) return;

	const { embedding, model } = await generateEmbedding(prompt);
	const interpretedIntent = await classifyPromptIntent(embedding, prompt);

	await db.insert(promptEvents).values({
		presentationId: params.presentationId,
		userId: params.userId,
		userPrompt: prompt,
		interpretedIntent,
		embedding,
		embeddingModel: model,
		metadata: {
			operation: params.operation,
			detailLevel: params.detailLevel,
			tonality: params.tonality,
		},
	});
}

export async function storeDeckMemory(
	generateEmbedding: GenerateEmbedding,
	params: StorePresentationSemanticMemoryParams
): Promise<void> {
	const content = buildDeckSummary(params);
	const { embedding, model } = await generateEmbedding(content);

	await db.insert(deckMemories).values({
		presentationId: params.presentationId,
		userId: params.userId,
		memoryType: "deck_summary",
		content,
		embedding,
		embeddingModel: model,
		metadata: {
			title: params.title,
			theme: params.theme,
			operation: params.operation,
			slideCount: params.slides.length,
		},
	});
}

export async function storeSlideMemories(
	generateEmbedding: GenerateEmbedding,
	params: StorePresentationSemanticMemoryParams
): Promise<void> {
	for (const [index, slide] of params.slides.entries()) {
		try {
			const { title, summary } = buildSlideSummary(slide, index);
			const { embedding, model } = await generateEmbedding(summary);

			await db.insert(slideEmbeddings).values({
				presentationId: params.presentationId,
				userId: params.userId,
				slideId: getSlideId(slide, index),
				slideIndex: index,
				slideType: slide.type || "content",
				title,
				summary,
				slideJson: slide,
				embedding,
				embeddingModel: model,
				metadata: {
					operation: params.operation,
					title: params.title,
				},
			});
		} catch (error) {
			logSafeError("rag_slide_memory_write_failed", error);
		}
	}
}

export async function storeStyleMemory(
	generateEmbedding: GenerateEmbedding,
	params: StorePresentationSemanticMemoryParams
): Promise<void> {
	const slideTypes = Array.from(new Set(params.slides.map((slide) => slide.type))).join(", ");
	const content = [
		`Deck style memory for "${params.title}".`,
		`Theme: ${params.theme || "corporate-blue"}.`,
		`Tone: ${params.tonality || "professional"}.`,
		`Detail level: ${params.detailLevel || "balanced"}.`,
		`Slide types: ${slideTypes || "content"}.`,
	].join(" ");
	const { embedding, model } = await generateEmbedding(content);

	await db.insert(styleMemories).values({
		presentationId: params.presentationId,
		userId: params.userId,
		content,
		embedding,
		embeddingModel: model,
		metadata: {
			theme: params.theme,
			tonality: params.tonality,
			detailLevel: params.detailLevel,
			operation: params.operation,
		},
	});
}

export async function storeFeedbackMemory(
	generateEmbedding: GenerateEmbedding,
	params: StorePresentationSemanticMemoryParams
): Promise<void> {
	const feedbackText = normalizeText(params.prompt);
	if (!feedbackText) return;

	const content = `Applied user feedback: ${feedbackText}`;
	const { embedding, model } = await generateEmbedding(content);

	await db.insert(feedbackMemories).values({
		presentationId: params.presentationId,
		userId: params.userId,
		feedbackText,
		outcome: "applied",
		embedding,
		embeddingModel: model,
		metadata: {
			title: params.title,
			theme: params.theme,
			slideCount: params.slides.length,
		},
	});
}

export async function storeExampleGeneration(
	generateEmbedding: GenerateEmbedding,
	params: StorePresentationSemanticMemoryParams
): Promise<void> {
	const summary = buildDeckSummary(params);
	const content = `${params.prompt}\n\n${summary}`;
	const { embedding, model } = await generateEmbedding(content);
	const outputJson: PresentationJSON = {
		schemaVersion: PRESENTATION_SCHEMA_VERSION,
		title: params.title,
		theme: params.theme,
		slides: params.slides,
		totalSlides: params.slides.length,
		sources: params.sources,
	};

	await db.insert(exampleGenerations).values({
		userId: params.userId,
		presentationId: params.presentationId,
		prompt: params.prompt,
		summary,
		outputJson,
		embedding,
		embeddingModel: model,
		metadata: {
			presentationId: params.presentationId,
			operation: params.operation,
			slideCount: params.slides.length,
		},
	});
}

export async function cleanupOldEmbeddings(userId: string, cutoffDate: Date): Promise<number> {
	let deleted = 0;

	deleted += await deleteOldRows(slideEmbeddings, userId, cutoffDate);
	deleted += await deleteOldRows(deckMemories, userId, cutoffDate);
	deleted += await deleteOldRows(sourceChunks, userId, cutoffDate);
	deleted += await deleteOldRows(promptEvents, userId, cutoffDate);
	deleted += await deleteOldRows(exampleGenerations, userId, cutoffDate);
	deleted += await deleteOldRows(styleMemories, userId, cutoffDate);
	deleted += await deleteOldRows(feedbackMemories, userId, cutoffDate);

	return deleted;
}

async function deleteOldRows(
	table:
		| typeof slideEmbeddings
		| typeof deckMemories
		| typeof sourceChunks
		| typeof promptEvents
		| typeof exampleGenerations
		| typeof styleMemories
		| typeof feedbackMemories,
	userId: string,
	cutoffDate: Date
): Promise<number> {
	const result = await db
		.delete(table)
		.where(and(eq(table.userId, userId), sql`${table.createdAt} < ${cutoffDate}`));

	return result.count || 0;
}
