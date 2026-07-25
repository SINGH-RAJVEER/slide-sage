import type {
    AIModelSelection,
    PresentationLayoutPreference,
    PresentationStreamEvent,
    ResearchOptions,
    ResearchPayload,
    ThemeId,
} from "@slide-sage/types";
import { streamStructuredPresentation } from "./ai/openrouter-presentation-stream";
import { buildGenerationMessages, buildIterationMessages } from "./ai/presentation-messages";
import {
    normalizeResearchOptions,
    resolveResearchSources,
    shouldSearchForResearch,
} from "./ai/research-sources";
import { buildGenerationPrompt, buildIterationPrompt } from "./ai-prompts";
import { RAGService } from "./rag.service";
import { SearchService } from "./search.service";

const DEFAULT_MODEL = "google/gemma-4-26b-a4b-it";

export class AIService {
    private searchService = new SearchService();
    private ragService = new RAGService();

    constructor() {
        console.log("AI Service initialized");
    }

    async *generatePresentationStream(
        userPrompt: string,
        slideCount = 8,
        detailLevel = "balanced",
        tonality = "professional",
        research?: ResearchOptions,
        researchPayload?: ResearchPayload,
        userId?: string,
        theme: ThemeId = "corporate-blue",
        layoutPreference: PresentationLayoutPreference = "auto",
        ai?: AIModelSelection & { apiKey: string }
    ): AsyncGenerator<PresentationStreamEvent, void, unknown> {
        console.log(
            `Starting generate presentation for: ${userPrompt.substring(0, 50)}... with ${slideCount} slides`
        );

        try {
            const systemPrompt = buildGenerationPrompt(
                detailLevel,
                tonality,
                theme,
                layoutPreference
            );
            const generationMemoryContext = userId
                ? await this.ragService.buildGenerationMemoryContextString(userId, userPrompt)
                : "";
            const effectiveResearch = normalizeResearchOptions(research);
            const isSearching = shouldSearchForResearch(effectiveResearch, researchPayload);

            if (isSearching) {
                yield { event: "research", data: { status: "searching" } };
            }

            const sources = await resolveResearchSources({
                query: userPrompt,
                research: effectiveResearch,
                researchPayload,
                searchClient: this.searchService,
                sourceRanker: this.ragService,
            });

            if (isSearching) {
                yield { event: "research", data: { status: "ready", sources } };
            }

            const messages = buildGenerationMessages({
                systemPrompt,
                generationMemoryContext,
                researchSources: sources,
                userPrompt,
                slideCount,
            });
            const model = ai?.model || process.env["OPEN_ROUTER_MODEL"] || DEFAULT_MODEL;

            if (isSearching) {
                yield { event: "research", data: { status: "generating" } };
            }
            yield { event: "start", data: { status: "generating" } };
            yield* streamStructuredPresentation({
                model,
                provider: ai?.provider,
                apiKey: ai?.apiKey,
                messages,
                expectedSlideCount: slideCount,
                fallbackTitle: "Untitled Presentation",
                sources,
                operation: "generation",
                preferredTheme: theme,
                layoutPreference,
            });
        } catch (error) {
            console.error("Error during generation:", error);
            yield {
                event: "error",
                data: { error: "An error occurred while generating the presentation." },
            };
        }
    }

    async *iteratePresentationStream(
        userId: string,
        presentationId: string,
        feedback: string,
        detailLevel = "balanced",
        tonality = "professional",
        research?: ResearchOptions,
        ai?: AIModelSelection & { apiKey: string }
    ): AsyncGenerator<PresentationStreamEvent, void, unknown> {
        console.log(
            `Starting presentation iteration with feedback: ${feedback.substring(0, 100)}...`
        );

        try {
            const ragContext = await this.ragService.buildRagContextString(
                userId,
                presentationId,
                feedback
            );
            const systemPrompt = buildIterationPrompt(feedback, detailLevel, tonality);
            const enhancedSystemPrompt = ragContext
                ? `${ragContext}\n${systemPrompt}`
                : systemPrompt;
            const effectiveResearch = normalizeResearchOptions(research);
            const isSearching = shouldSearchForResearch(effectiveResearch);

            if (isSearching) {
                yield { event: "research", data: { status: "searching" } };
            }

            const sources = await resolveResearchSources({
                query: feedback,
                research: effectiveResearch,
                searchClient: this.searchService,
                sourceRanker: this.ragService,
            });

            if (isSearching) {
                yield { event: "research", data: { status: "ready", sources } };
            }

            const messages = buildIterationMessages({
                systemPrompt: enhancedSystemPrompt,
                researchSources: sources,
                feedback,
            });
            const model = ai?.model || process.env["OPEN_ROUTER_MODEL"] || DEFAULT_MODEL;

            if (isSearching) {
                yield { event: "research", data: { status: "generating" } };
            }
            yield { event: "start", data: { status: "iterating" } };
            yield* streamStructuredPresentation({
                model,
                provider: ai?.provider,
                apiKey: ai?.apiKey,
                messages,
                fallbackTitle: "Updated Presentation",
                sources,
                operation: "iteration",
            });
        } catch (error) {
            console.error("Error during iteration:", error);
            yield {
                event: "error",
                data: { error: "An error occurred while updating the presentation." },
            };
        }
    }
}
