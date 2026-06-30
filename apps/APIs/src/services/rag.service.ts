/**
 * RAG Service
 * Handles embedding generation, storage, and retrieval for augmented generation
 */

import {
    db,
    type PresentationEmbedding,
    presentationEmbeddings,
    type RagContext,
    ragContext,
    type SearchEmbedding,
    searchEmbeddings,
} from "@slide-sage/database";
import type { Slide } from "@slide-sage/types";
import { and, cosineDistance, desc, eq, sql } from "drizzle-orm";

export interface EmbeddingResult {
    embedding: number[];
    model: string;
}

export interface SimilarContext {
    context: string;
    similarity: number;
    sourceType: string;
    metadata?: Record<string, unknown>;
}

/**
 * RAG Service for managing embeddings and context retrieval
 */
export class RAGService {
    private embeddingModel: string;

    constructor() {
        this.embeddingModel = process.env.EMBEDDING_MODEL || "google/gemini-embedding-001";

        if (!this.embeddingModel) {
            console.warn("EMBEDDING_MODEL not set. Using default: google/gemini-embedding-001");
        }
    }

    /**
     * Generate embeddings using OpenRouter
     */
    async generateEmbedding(text: string): Promise<EmbeddingResult> {
        try {
            if (!text || text.trim().length === 0) {
                throw new Error("Text cannot be empty");
            }

            const requestBody = {
                model: this.embeddingModel,
                input: text,
                encoding_format: "float",
                dimensions: 768,
            };

            const apiKey = process.env.OPEN_ROUTER_API_KEY;
            if (!apiKey) {
                throw new Error("OPEN_ROUTER_API_KEY is not set");
            }

            const embeddingsUrl =
                process.env.OPEN_ROUTER_EMBEDDINGS_URL || "https://openrouter.ai/api/v1/embeddings";

            console.log(
                `Generating embedding using model: ${this.embeddingModel} at ${embeddingsUrl}`
            );

            const response = await fetch(embeddingsUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                    "HTTP-Referer": process.env.BASE_URL || "http://localhost:8000",
                    "X-OpenRouter-Title": "Slide Sage",
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const error = await response.text();
                console.error("OpenRouter embedding API error:", error);
                throw new Error(`Failed to generate embedding: ${response.statusText}`);
            }

            const data = await response.json();

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
            console.error("Error generating embedding:", error);
            throw error;
        }
    }

    /**
     * Store search query embedding
     */
    async storeSearchEmbedding(
        userId: string,
        searchQuery: string
    ): Promise<SearchEmbedding | null> {
        try {
            const { embedding } = await this.generateEmbedding(searchQuery);

            const result = await db
                .insert(searchEmbeddings)
                .values({
                    userId,
                    searchQuery,
                    embedding,
                    embeddingModel: this.embeddingModel,
                    metadata: {
                        queryLength: searchQuery.length,
                        timestamp: new Date().toISOString(),
                    },
                })
                .returning();

            return result[0] || null;
        } catch (error) {
            console.error("Error storing search embedding:", error);
            return null;
        }
    }

    /**
     * Store presentation iteration embedding
     */
    async storePresentationEmbedding(
        presentationId: string,
        userId: string,
        iterationPrompt: string,
        slides: Slide[]
    ): Promise<PresentationEmbedding | null> {
        try {
            // Serialize presentation content for context
            const presentationContent = this.serializeSlides(slides);
            const combinedText = `${iterationPrompt}\n\n${presentationContent}`;

            const { embedding } = await this.generateEmbedding(combinedText);

            const result = await db
                .insert(presentationEmbeddings)
                .values({
                    presentationId,
                    userId,
                    iterationPrompt,
                    presentationContent,
                    embedding,
                    embeddingModel: this.embeddingModel,
                    metadata: {
                        slideCount: slides.length,
                        timestamp: new Date().toISOString(),
                        contentLength: presentationContent.length,
                    },
                })
                .returning();

            return result[0] || null;
        } catch (error) {
            console.error("Error storing presentation embedding:", error);
            return null;
        }
    }

    /**
     * Retrieve similar contexts for a presentation
     */
    async retrieveSimilarContexts(
        userId: string,
        presentationId: string,
        query: string,
        topK = 5,
        similarityThreshold = 0.7
    ): Promise<SimilarContext[]> {
        try {
            const { embedding } = await this.generateEmbedding(query);

            // Calculate similarity distance (cosine distance is 1 - cosine similarity)
            const searchEmbed = sql<number>`1 - (${cosineDistance(
                searchEmbeddings.embedding,
                embedding
            )})`;
            const presentEmbed = sql<number>`1 - (${cosineDistance(
                presentationEmbeddings.embedding,
                embedding
            )})`;

            // Retrieve similar search embeddings
            const similarSearches = await db
                .select({
                    context: searchEmbeddings.searchQuery,
                    similarity: searchEmbed,
                    sourceType: sql<string>`'search'`,
                    metadata: searchEmbeddings.metadata,
                })
                .from(searchEmbeddings)
                .where(
                    and(
                        eq(searchEmbeddings.userId, userId),
                        sql`1 - (${cosineDistance(searchEmbeddings.embedding, embedding)}) > ${similarityThreshold}`
                    )
                )
                .orderBy(desc(searchEmbed))
                .limit(Math.ceil(topK / 2));

            // Retrieve similar presentation embeddings
            const similarPresentations = await db
                .select({
                    context: presentationEmbeddings.iterationPrompt,
                    similarity: presentEmbed,
                    sourceType: sql<string>`'iteration'`,
                    metadata: presentationEmbeddings.metadata,
                })
                .from(presentationEmbeddings)
                .where(
                    and(
                        eq(presentationEmbeddings.userId, userId),
                        eq(presentationEmbeddings.presentationId, presentationId),
                        sql`1 - (${cosineDistance(presentationEmbeddings.embedding, embedding)}) > ${similarityThreshold}`
                    )
                )
                .orderBy(desc(presentEmbed))
                .limit(Math.ceil(topK / 2));

            // Combine and sort by similarity
            const allContexts: SimilarContext[] = [...similarSearches, ...similarPresentations];
            allContexts.sort((a, b) => b.similarity - a.similarity);

            return allContexts.slice(0, topK);
        } catch (error) {
            console.error("Error retrieving similar contexts:", error);
            return [];
        }
    }

    /**
     * Store RAG context for a presentation
     */
    async storeRagContext(
        presentationId: string,
        userId: string,
        sourceType: "search" | "iteration" | "presentation",
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
            console.error("Error storing RAG context:", error);
            return null;
        }
    }

    /**
     * Get all RAG contexts for a presentation
     */
    async getPresentationRagContexts(presentationId: string, limit = 10): Promise<RagContext[]> {
        try {
            return await db
                .select()
                .from(ragContext)
                .where(eq(ragContext.presentationId, presentationId))
                .orderBy(desc(ragContext.createdAt))
                .limit(limit);
        } catch (error) {
            console.error("Error retrieving RAG contexts:", error);
            return [];
        }
    }

    /**
     * Build RAG context string for LLM prompt
     */
    async buildRagContextString(
        userId: string,
        presentationId: string,
        query: string
    ): Promise<string> {
        try {
            const similarContexts = await this.retrieveSimilarContexts(
                userId,
                presentationId,
                query,
                5,
                0.6
            );

            if (similarContexts.length === 0) {
                return "";
            }

            const contextLines = similarContexts.map((ctx, index) => {
                const sourceLabel =
                    ctx.sourceType === "search" ? "Previous Search" : "Previous Iteration";
                const similarity = (ctx.similarity * 100).toFixed(1);
                return `${index + 1}. ${sourceLabel} (${similarity}% similarity):\n${ctx.context}`;
            });

            return `## RELEVANT PREVIOUS CONTEXTS:\n\n${contextLines.join("\n\n")}\n\n`;
        } catch (error) {
            console.error("Error building RAG context string:", error);
            return "";
        }
    }

    /**
     * Serialize slides to text for embedding
     */
    private serializeSlides(slides: Slide[]): string {
        return slides
            .map((slide, index) => {
                const lines: string[] = [`Slide ${index + 1}:`];

                if (slide.title) lines.push(`Title: ${slide.title}`);
                if (slide.content) lines.push(`Content: ${slide.content}`);
                if (slide.notes) lines.push(`Notes: ${slide.notes}`);
                if (slide.type) lines.push(`Type: ${slide.type}`);

                return lines.join("\n");
            })
            .join("\n\n");
    }

    /**
     * Clean up old embeddings for a user
     */
    async cleanupOldEmbeddings(userId: string, daysToKeep = 30): Promise<number> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            // Delete old search embeddings
            await db
                .delete(searchEmbeddings)
                .where(
                    and(
                        eq(searchEmbeddings.userId, userId),
                        sql`${searchEmbeddings.createdAt} < ${cutoffDate}`
                    )
                );

            // Delete old presentation embeddings
            const result = await db
                .delete(presentationEmbeddings)
                .where(
                    and(
                        eq(presentationEmbeddings.userId, userId),
                        sql`${presentationEmbeddings.createdAt} < ${cutoffDate}`
                    )
                );

            return result.rowCount || 0;
        } catch (error) {
            console.error("Error cleaning up embeddings:", error);
            return 0;
        }
    }
}
