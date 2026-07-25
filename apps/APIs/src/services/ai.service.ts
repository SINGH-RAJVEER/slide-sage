import type {
    PresentationJSON,
    PresentationStreamEvent,
    ResearchOptions,
    ResearchPayload,
    ThemeId,
} from "@slide-sage/types";
import { streamStructuredPresentation } from "./ai/openrouter-presentation-stream";
import {
    addOutlineToMessages,
    buildGenerationMessages,
    buildIterationMessages,
} from "./ai/presentation-messages";
import { buildOutlineMessages, generatePresentationOutline } from "./ai/presentation-outline";
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
        theme: ThemeId = "corporate-blue"
    ): AsyncGenerator<PresentationStreamEvent, void, unknown> {
        console.log(
            `Starting generate presentation for: ${userPrompt.substring(0, 50)}... with ${slideCount} slides`
        );

        try {
            const systemPrompt = buildGenerationPrompt(detailLevel, tonality, theme);
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
            const outlineMessages = buildGenerationMessages({
                systemPrompt,
                generationMemoryContext: "",
                researchSources: sources,
                userPrompt,
                slideCount,
            });
            const model = process.env["OPEN_ROUTER_MODEL"] || DEFAULT_MODEL;

            if (isSearching) {
                yield { event: "research", data: { status: "generating" } };
            }
            yield {
                event: "stage",
                data: {
                    stage: "planning",
                    message: "Structuring the narrative",
                    completed: 1,
                    total: 4,
                },
            };
            const outlineResult = await generatePresentationOutline({
                model,
                messages: buildOutlineMessages(outlineMessages),
                slideCount,
                fallbackTitle: userPrompt.slice(0, 120) || "Untitled Presentation",
                cache: researchPayload
                    ? undefined
                    : {
                          query: userPrompt,
                          variant: {
                              detailLevel,
                              tonality,
                              theme,
                              sources: sources.map((source) => ({
                                  url: source.url,
                                  publishedDate: source.published_date,
                                  summary: source.summary,
                              })),
                          },
                      },
            });
            const { outline } = outlineResult;
            console.info(`Outline cache status=${outlineResult.cacheStatus}`);
            yield { event: "outline", data: outline };
            yield {
                event: "stage",
                data: {
                    stage: "drafting",
                    message: "Writing slide content",
                    completed: 2,
                    total: 4,
                },
            };
            yield { event: "start", data: { status: "generating" } };
            for await (const event of streamStructuredPresentation({
                model,
                messages: addOutlineToMessages(messages, outline),
                expectedSlideCount: slideCount,
                fallbackTitle: "Untitled Presentation",
                sources,
                operation: "generation",
                preferredTheme: theme,
                outline,
            })) {
                if (event.event === "complete") {
                    yield {
                        ...event,
                        data: {
                            ...event.data,
                            tokens_used: (event.data.tokens_used || 0) + outlineResult.tokensUsed,
                            outline_cache_status: outlineResult.cacheStatus,
                        },
                    };
                } else {
                    yield event;
                }
            }
        } catch (error) {
            console.error("Error during generation:", error);
            yield {
                event: "error",
                data: {
                    error:
                        error instanceof Error
                            ? error.message
                            : "An error occurred while generating the presentation.",
                },
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
        currentPresentation?: PresentationJSON,
        slideCount?: number,
        theme?: ThemeId
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
                currentPresentation: currentPresentation
                    ? JSON.stringify(currentPresentation).slice(0, 120000)
                    : undefined,
            });
            const model = process.env["OPEN_ROUTER_MODEL"] || DEFAULT_MODEL;
            const expectedSlideCount =
                slideCount && slideCount > 0
                    ? slideCount
                    : currentPresentation?.slides.length || undefined;

            if (isSearching) {
                yield { event: "research", data: { status: "generating" } };
            }
            const outlineResult = expectedSlideCount
                ? await generatePresentationOutline({
                      model,
                      messages: buildOutlineMessages(messages),
                      slideCount: expectedSlideCount,
                      fallbackTitle: currentPresentation?.title || "Updated Presentation",
                  })
                : undefined;
            const outline = outlineResult?.outline;
            if (outline) yield { event: "outline", data: outline };
            yield { event: "start", data: { status: "iterating" } };
            for await (const event of streamStructuredPresentation({
                model,
                messages: outline ? addOutlineToMessages(messages, outline) : messages,
                expectedSlideCount,
                fallbackTitle: "Updated Presentation",
                sources: sources.length ? sources : currentPresentation?.sources || [],
                operation: "iteration",
                preferredTheme: theme,
                outline,
            })) {
                if (event.event === "complete" && outlineResult) {
                    yield {
                        ...event,
                        data: {
                            ...event.data,
                            tokens_used: (event.data.tokens_used || 0) + outlineResult.tokensUsed,
                            outline_cache_status: outlineResult.cacheStatus,
                        },
                    };
                } else {
                    yield event;
                }
            }
        } catch (error) {
            console.error("Error during iteration:", error);
            yield {
                event: "error",
                data: { error: "An error occurred while updating the presentation." },
            };
        }
    }
}
