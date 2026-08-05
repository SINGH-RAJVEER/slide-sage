/**
 * Presentation Service
 * Handles presentation generation with token management and streaming
 */

import {
    type AIModelSelection,
    buildResearchSystemMessage,
    type PresentationJSON,
    type PresentationMutation,
    type PresentationStreamEvent,
    type ResearchOptions,
    type ResearchPayload,
    type Slide,
    type Source,
    type ThemeId,
} from "@slidesage/types";
import type { Presentation } from "@/database";
import { PresentationRepository, TokenCalculator } from "@/database";
import { logSafeError } from "../utils/safe-logging";
import { AIService } from "./ai.service";
import { applyPresentationMutations, normalizePresentationDocument } from "./presentation-document";
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
    theme?: ThemeId;
    ai?: AIModelSelection & { apiKey: string };
    signal?: AbortSignal;
}

export interface IteratePresentationParams {
    userId: string;
    presentationId: string;
    operationId: string;
    feedback: string;
    detailLevel?: string;
    tonality?: string;
    research?: ResearchOptions;
    ai?: AIModelSelection & { apiKey: string };
    slideCount?: number;
    signal?: AbortSignal;
}

export interface StorePresentationMemoryParams {
    presentationId: string;
    userId: string;
    prompt: string;
    slides: Slide[];
    title: string;
    theme: string;
    operation: "generation" | "iteration";
    detailLevel?: string;
    tonality?: string;
    sources?: Source[];
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
        tonality = "professional",
        topic = "",
        researchPayload?: ResearchPayload
    ): number {
        const researchContext = researchPayload?.sources.length
            ? buildResearchSystemMessage(researchPayload.sources, topic)
            : undefined;
        const estimate = TokenCalculator.calculateEstimatedTokens({
            slideCount,
            detailLevel,
            tonality,
            researchContext,
        });
        return estimate.estimatedTokens;
    }

    calculateActualTokenCost(aiTokensUsed: number, quotedTokenCost: number): number {
        if (!Number.isFinite(aiTokensUsed) || aiTokensUsed <= 0) return quotedTokenCost;
        const actualCost = TokenCalculator.calculateActualTokenDeduction(aiTokensUsed);
        return Math.min(quotedTokenCost, Math.round(actualCost * 1000) / 1000);
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
            theme = "corporate-blue",
        } = params;

        try {
            // Stream presentation generation
            for await (const event of this.aiService.generatePresentationStream(
                topic,
                slideCount,
                detailLevel,
                tonality,
                research,
                researchPayload,
                params.userId,
                theme,
                params.ai,
                params.signal
            )) {
                yield event;
            }
        } catch (error) {
            params.signal?.throwIfAborted();
            logSafeError("presentation_service_generation_failed", error);
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

            const currentPresentation = normalizePresentationDocument(
                existingPresentation.slidesData
            );

            try {
                // Stream presentation iteration
                for await (const event of this.aiService.iteratePresentationStream(
                    userId,
                    presentationId,
                    feedback,
                    detailLevel,
                    tonality,
                    research,
                    currentPresentation,
                    params.slideCount,
                    currentPresentation.theme as ThemeId,
                    params.ai,
                    params.signal
                )) {
                    yield event;
                }

                // Persistence is handled by the HTTP route layer.
            } catch (error) {
                params.signal?.throwIfAborted();
                logSafeError("presentation_service_iteration_stream_failed", error);
                throw error;
            }
        } catch (error) {
            params.signal?.throwIfAborted();
            logSafeError("presentation_service_iteration_failed", error);
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

    async updatePresentation(
        presentationId: string,
        userId: string,
        mutations: PresentationMutation[]
    ): Promise<Presentation> {
        const presentation = await this.getPresentation(presentationId, userId);
        const storedDocument = presentation.slidesData as Partial<PresentationJSON>;
        const current = normalizePresentationDocument({
            ...storedDocument,
            title: storedDocument.title || presentation.title,
        });
        const slidesData = applyPresentationMutations(current, mutations);
        const updated = await this.presentationRepo.updateOwnedAtRevision(
            presentationId,
            userId,
            presentation.revision,
            {
                title: slidesData.title,
                slidesData: slidesData as PresentationJSON,
            }
        );
        if (!updated) throw new Error("Presentation changed while it was being saved");
        return updated;
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
     * Store semantic memory for saved presentation state.
     */
    async storePresentationMemory(params: StorePresentationMemoryParams): Promise<void> {
        try {
            await this.ragService.storePresentationSemanticMemory(params);
            console.log(
                `Stored semantic memory for presentation ${params.presentationId} (${params.operation})`
            );
        } catch (error) {
            logSafeError("presentation_service_memory_write_failed", error);
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
            logSafeError("presentation_service_rag_read_failed", error);
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
