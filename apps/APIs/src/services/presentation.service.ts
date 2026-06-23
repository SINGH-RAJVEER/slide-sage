/**
 * Presentation Service
 * Handles presentation generation with token management and streaming
 */

import type { Presentation } from "@slide-sage/database";
import { PresentationRepository, TokenCalculator } from "@slide-sage/database";
import type {
    PresentationStreamEvent,
    ResearchOptions,
    ResearchPayload,
    Slide,
} from "@slide-sage/types";
import { AIService } from "./ai.service";
import { RAGService } from "./rag.service";

export interface GeneratePresentationParams {
    userId: string;
    operationId: string;
    topic: string;
    slideCount: number;
    detailLevel?: string;
    tonality?: string;
    research?: ResearchOptions;
    researchPayload?: ResearchPayload;
}

export interface IteratePresentationParams {
    userId: string;
    presentationId: string;
    operationId: string;
    feedback: string;
    detailLevel?: string;
    tonality?: string;
    research?: ResearchOptions;
}

export class PresentationService {
    private aiService: AIService;
    private presentationRepo = new PresentationRepository();
    private ragService = new RAGService();

    constructor() {
        this.aiService = new AIService();
    }

    /**
     * Calculate estimated tokens for presentation generation
     */
    calculateEstimatedTokens(
        slideCount: number,
        detailLevel = "balanced",
        tonality = "professional"
    ): number {
        const estimate = TokenCalculator.calculateEstimatedTokens({
            slideCount,
            detailLevel,
            tonality,
        });
        return estimate.estimatedTokens;
    }

    /**
     * Generate presentation with token management and streaming
     */
    async *generatePresentationStream(
        params: GeneratePresentationParams
    ): AsyncGenerator<PresentationStreamEvent, void, unknown> {
        const {
            topic,
            slideCount,
            detailLevel = "balanced",
            tonality = "professional",
            research,
            researchPayload,
        } = params;

        try {
            // Stream presentation generation
            for await (const event of this.aiService.generatePresentationStream(
                topic,
                slideCount,
                detailLevel,
                tonality,
                research,
                researchPayload
            )) {
                yield event;
            }
        } catch (error) {
            console.error("Error in presentation generation:", error);
            yield {
                event: "error",
                data: { error: "Generation failed. Please try again." },
            };
        }
    }

    /**
     * Iterate on existing presentation with feedback
     */
    async *iteratePresentationStream(
        params: IteratePresentationParams
    ): AsyncGenerator<PresentationStreamEvent, void, unknown> {
        const {
            userId,
            presentationId,
            feedback,
            detailLevel = "balanced",
            tonality = "professional",
            research,
        } = params;

        try {
            // Get the existing presentation
            const existingPresentation = await this.presentationRepo.findById(presentationId);

            if (!existingPresentation) {
                yield {
                    event: "error",
                    data: { error: "Presentation not found" },
                };
                return;
            }

            // Verify user owns the presentation
            if (existingPresentation.userId !== userId) {
                yield {
                    event: "error",
                    data: { error: "Unauthorized access to presentation" },
                };
                return;
            }

            // Note: currentSlides are stored in the vector database and retrieved via RAG
            // No need to pass them directly to the AI service

            try {
                // Stream presentation iteration
                for await (const event of this.aiService.iteratePresentationStream(
                    userId,
                    presentationId,
                    feedback,
                    detailLevel,
                    tonality,
                    research
                )) {
                    yield event;
                }

                // Persistence is handled by the HTTP route layer.
            } catch (error) {
                console.error("Error during iteration:", error);
                throw error;
            }
        } catch (error) {
            console.error("Error in presentation iteration:", error);
            yield {
                event: "error",
                data: { error: "Iteration failed. Please try again." },
            };
        }
    }

    /**
     * Get user presentations with pagination
     */
    async getUserPresentations(
        userId: string,
        limit = 20,
        offset = 0
    ): Promise<{
        presentations: Presentation[];
        total: number;
        hasMore: boolean;
    }> {
        return await this.presentationRepo.findByUserId(userId, limit, offset);
    }

    /**
     * Get presentation by ID with ownership check
     */
    async getPresentation(presentationId: string, userId: string): Promise<Presentation> {
        const presentation = await this.presentationRepo.findById(presentationId);

        if (!presentation) {
            throw new Error("Presentation not found");
        }

        if (presentation.userId !== userId) {
            throw new Error("Unauthorized access to presentation");
        }

        return presentation;
    }

    /**
     * Delete presentation with ownership check
     */
    async deletePresentation(presentationId: string, userId: string): Promise<void> {
        const presentation = await this.presentationRepo.findById(presentationId);

        if (!presentation) {
            throw new Error("Presentation not found");
        }

        if (presentation.userId !== userId) {
            throw new Error("Unauthorized access to presentation");
        }

        await this.presentationRepo.delete(presentationId);
    }

    /**
     * Get presentation iterations/versions
     */
    async getPresentationIterations(
        presentationId: string,
        userId: string
    ): Promise<Presentation[]> {
        await this.getPresentation(presentationId, userId);
        return await this.presentationRepo.findIterations(presentationId);
    }

    /**
     * Store presentation iteration with RAG embedding
     */
    async storeIterationWithEmbedding(
        presentationId: string,
        userId: string,
        feedback: string,
        slides: Slide[]
    ): Promise<void> {
        try {
            await this.ragService.storePresentationEmbedding(
                presentationId,
                userId,
                feedback,
                slides
            );
            console.log(
                `Stored presentation embedding for iteration: ${feedback.substring(0, 50)}...`
            );
        } catch (error) {
            console.warn("Failed to store presentation embedding:", error);
            // Non-critical, continue without RAG
        }
    }

    /**
     * Get RAG context for presentation iteration
     */
    async getRagContextForIteration(
        userId: string,
        presentationId: string,
        query: string
    ): Promise<string> {
        try {
            return await this.ragService.buildRagContextString(userId, presentationId, query);
        } catch (error) {
            console.warn("Failed to retrieve RAG context:", error);
            return "";
        }
    }

    /**
     * Get token pricing information
     */
    getTokenPricing(): Record<string, unknown> {
        return {
            tiers: TokenCalculator.getTokenPricingTiers(),
            dailyBonus: TokenCalculator.getDailyLoginBonus(),
            detailLevels: ["brief", "concise", "balanced", "detailed", "comprehensive"].map(
                (level) => TokenCalculator.getDetailLevelInfo(level)
            ),
            tonalities: ["casual", "professional", "enthusiastic", "persuasive"].map((tonality) =>
                TokenCalculator.getTonalityInfo(tonality)
            ),
        };
    }
}
