import type {
    OpenRouterMessage,
    PresentationJSON,
    PresentationStreamEvent,
    ResearchOptions,
    ResearchPayload,
    Slide,
    Source,
} from "@slide-sage/types";
import { JSONRecoveryError, recoverJson } from "../utils/json-recovery";
import {
    OpenRouterStreamError,
    readOpenRouterStream,
    requestOpenRouterStream,
} from "../utils/openrouter-stream";
import { StreamProcessor } from "../utils/stream-processor";
import { buildGenerationPrompt, buildIterationPrompt } from "./ai-prompts";
import { RAGService } from "./rag.service";
import { SearchService } from "./search.service";

interface RawSlide extends Record<string, unknown> {
    id?: unknown;
    type?: unknown;
    html?: unknown;
    chartConfig?: unknown;
}

interface RawPresentation extends Record<string, unknown> {
    slides?: unknown;
    title?: unknown;
}

interface OpenRouterEnvironment {
    OPEN_ROUTER_API_BASE?: string;
    OPEN_ROUTER_API_KEY?: string;
}

export class AIService {
    private searchService = new SearchService();
    private ragService = new RAGService();

    constructor() {
        console.log("AI Service initialized");
    }

    private buildResearchSystemMessage(
        sources: Source[],
        originalQuery: string,
        summary?: string | null
    ): string {
        const trimmedQuery = String(originalQuery ?? "").trim();
        const cappedSources = sources.slice(0, 8);
        const summaryBlock = summary
            ? `\nRESEARCH SUMMARY (from a secondary model):\n${summary.trim()}\n`
            : "";

        return `WEB RESEARCH MODE IS ENABLED.

The user requested that you vet factual claims with recent information. Use the RESEARCH SOURCES below for any time-sensitive or factual details.

Rules:
- Prefer these sources over general knowledge for dates, stats, versions, pricing, or "latest" info.
- Do NOT invent citations or facts. If sources don't support a claim, either omit it or mark it as uncertain in slide notes.
- You may add a "notes" field on slides to include brief citations like: "Sources: https://example.com, ...".
- Output must still be a single valid JSON object (no markdown).

User topic: ${trimmedQuery || "(not provided)"}

${summaryBlock}
RESEARCH SOURCES (JSON):
${JSON.stringify(cappedSources, null, 2)}`;
    }

    private processSlide(input: unknown, index: number): Slide | null {
        if (!input || typeof input !== "object") {
            console.warn(`Invalid slide ${index}, skipping`);
            return null;
        }

        const slide = input as RawSlide;
        const id = typeof slide.id === "string" && slide.id ? slide.id : `slide-${index + 1}`;
        const type = typeof slide.type === "string" && slide.type ? slide.type : "content";

        if (type === "chart") {
            const chartConfig = slide.chartConfig;
            if (
                chartConfig &&
                typeof chartConfig === "object" &&
                "data" in chartConfig &&
                chartConfig.data &&
                typeof chartConfig.data === "object"
            ) {
                return { ...slide, id, type, chartConfig } as Slide;
            }

            console.warn(`Chart slide ${index} missing chartConfig, converting to content`);
            return {
                ...slide,
                id,
                type: "content",
                html: '<div id="slide-content"><h2 id="slide-title">Data Visualization</h2><p id="slide-description">Chart data unavailable</p></div>',
            } as Slide;
        }

        if (typeof slide.html !== "string" || !slide.html.trim()) {
            console.warn(`Slide ${index} has no renderable content, skipping`);
            return null;
        }

        const htmlContent = slide.html.trim();
        const hasWrapper = /^<div\b[^>]*\bid=["']slide-content["']/i.test(htmlContent);
        const html = hasWrapper ? htmlContent : `<div id="slide-content">${htmlContent}</div>`;
        return { ...slide, id, type, html } as Slide;
    }

    private positiveInteger(name: string, fallback: number): number {
        const parsed = Number.parseInt(process.env[name] || "", 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }

    private retryDelay(attempt: number, retryAfterMs?: number): number {
        const baseDelay = this.positiveInteger("OPEN_ROUTER_RETRY_BASE_DELAY_MS", 1000);
        const maxDelay = this.positiveInteger("OPEN_ROUTER_RETRY_MAX_DELAY_MS", 30000);
        const exponentialDelay = baseDelay * 2 ** Math.max(0, attempt - 1);
        return Math.min(maxDelay, Math.max(retryAfterMs || 0, exponentialDelay));
    }

    private async wait(delayMs: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    private parsePresentationContent(content: string): RawPresentation {
        try {
            return JSON.parse(content) as RawPresentation;
        } catch (jsonError) {
            console.warn("Initial JSON parse failed, attempting recovery...");
            const recoveryResult = recoverJson(content, jsonError as Error);
            if (!recoveryResult.content || typeof recoveryResult.content !== "object") {
                throw new JSONRecoveryError("Recovered response was not a JSON object");
            }
            console.log(`JSON recovery successful using ${recoveryResult.strategy} strategy`);
            return recoveryResult.content as RawPresentation;
        }
    }

    private async *streamStructuredPresentation(options: {
        model: string;
        messages: OpenRouterMessage[];
        expectedSlideCount?: number;
        fallbackTitle: string;
        researchTokens: number;
        sources: Source[];
        operation: "generation" | "iteration";
    }): AsyncGenerator<PresentationStreamEvent, void, unknown> {
        const maxAttempts = this.positiveInteger("OPEN_ROUTER_MAX_ATTEMPTS", 3);
        const requestTimeoutMs = this.positiveInteger("OPEN_ROUTER_REQUEST_TIMEOUT_MS", 180000);
        const idleTimeoutMs = this.positiveInteger("OPEN_ROUTER_STREAM_IDLE_TIMEOUT_MS", 120000);
        const maxResponseBytes = this.positiveInteger(
            "OPEN_ROUTER_MAX_RESPONSE_BYTES",
            8 * 1024 * 1024
        );
        const environment = process.env as OpenRouterEnvironment;
        const endpoint =
            environment.OPEN_ROUTER_API_BASE || "https://openrouter.ai/api/v1/chat/completions";
        const apiKey = environment.OPEN_ROUTER_API_KEY;

        if (!apiKey) {
            yield {
                event: "error",
                data: { error: "OpenRouter is not configured. Set OPEN_ROUTER_API_KEY." },
            };
            return;
        }

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const processor = new StreamProcessor();
            let chunkCount = 0;

            try {
                const response = await requestOpenRouterStream({
                    endpoint,
                    apiKey,
                    model: options.model,
                    messages: options.messages,
                    requestTimeoutMs,
                });

                for await (const chunk of readOpenRouterStream(response, {
                    idleTimeoutMs,
                    maxResponseBytes,
                })) {
                    chunkCount++;
                    const finishReason = chunk.choices?.[0]?.finish_reason;
                    if (finishReason === "length") {
                        throw new OpenRouterStreamError(
                            "OpenRouter stopped because the response reached its token limit"
                        );
                    }

                    const chunkContent = processor.processChunk(chunk);
                    if (chunkContent) {
                        processor.accumulateContent(chunkContent);
                    }

                    if (!processor.themeYielded) {
                        const theme = processor.extractTheme();
                        if (theme) {
                            yield { event: "theme", data: { theme } };
                        }
                    }

                    for (const { index, slide } of processor.extractSlides()) {
                        if (
                            options.expectedSlideCount !== undefined &&
                            index >= options.expectedSlideCount
                        ) {
                            continue;
                        }
                        const processedSlide = this.processSlide(slide, index);
                        if (!processedSlide) continue;

                        if (processor.titleExtracted === null) {
                            processor.titleExtracted = processor.extractTitleFromSlide(slide);
                        }
                        yield {
                            event: "slide",
                            data: {
                                slide: processedSlide,
                                index,
                                title: processor.titleExtracted,
                            },
                        };
                    }
                }

                console.log(
                    `${options.operation} stream attempt ${attempt} completed with ${chunkCount} chunks`
                );

                const cleanContent = processor.getCleanContent();
                if (!cleanContent) {
                    throw new OpenRouterStreamError("OpenRouter returned no presentation content");
                }

                const parsedContent = this.parsePresentationContent(cleanContent);
                const rawSlides = Array.isArray(parsedContent.slides) ? parsedContent.slides : [];
                let slides = rawSlides
                    .map((slide, index) => this.processSlide(slide, index))
                    .filter((slide): slide is Slide => slide !== null);

                if (slides.length === 0) {
                    throw new OpenRouterStreamError("OpenRouter returned no usable slides");
                }
                if (
                    options.expectedSlideCount !== undefined &&
                    slides.length < options.expectedSlideCount
                ) {
                    throw new OpenRouterStreamError(
                        `OpenRouter returned ${slides.length} of ${options.expectedSlideCount} requested slides`
                    );
                }
                if (
                    options.expectedSlideCount !== undefined &&
                    slides.length > options.expectedSlideCount
                ) {
                    console.warn(
                        `OpenRouter returned ${slides.length} slides; keeping the requested ${options.expectedSlideCount}`
                    );
                    slides = slides.slice(0, options.expectedSlideCount);
                }

                const usedIds = new Set<string>();
                for (const [index, slide] of slides.entries()) {
                    const candidate = String(slide.id || "").trim();
                    const id =
                        candidate && !usedIds.has(candidate) ? candidate : `slide-${index + 1}`;
                    slide.id = id;
                    usedIds.add(id);
                }

                if (processor.titleExtracted === null) {
                    const firstSlide = slides[0];
                    if (firstSlide) {
                        processor.titleExtracted = processor.extractTitleFromSlide(
                            firstSlide as unknown as Record<string, unknown>
                        );
                    }
                }

                for (let index = processor.currentSlidesYielded; index < slides.length; index++) {
                    const slide = slides[index];
                    if (!slide) continue;
                    yield {
                        event: "slide",
                        data: {
                            slide,
                            index,
                            title: processor.titleExtracted,
                        },
                    };
                }

                const parsedTitle =
                    typeof parsedContent.title === "string" ? parsedContent.title : "";
                const presentation: PresentationJSON = {
                    ...parsedContent,
                    slides,
                    title: processor.titleExtracted || parsedTitle || options.fallbackTitle,
                    theme:
                        typeof parsedContent["theme"] === "string"
                            ? parsedContent["theme"]
                            : "default",
                    totalSlides: slides.length,
                    research_tokens_used: options.researchTokens,
                    tokens_used: processor.currentTotalTokensUsed + options.researchTokens,
                };
                if (options.sources.length) {
                    presentation.sources = options.sources;
                }

                yield {
                    event: "complete",
                    data: presentation,
                };
                return;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const retryable = !(error instanceof OpenRouterStreamError) || error.retryable;
                console.warn(
                    `${options.operation} stream attempt ${attempt}/${maxAttempts} failed: ${message}`
                );

                if (retryable && attempt < maxAttempts) {
                    const delayMs = this.retryDelay(
                        attempt,
                        error instanceof OpenRouterStreamError ? error.retryAfterMs : undefined
                    );
                    yield {
                        event: "retry",
                        data: {
                            attempt: attempt + 1,
                            max_attempts: maxAttempts,
                            delay_ms: delayMs,
                            reason: message.slice(0, 240),
                        },
                    };
                    await this.wait(delayMs);
                    continue;
                }

                yield {
                    event: "error",
                    data: {
                        error:
                            options.operation === "generation"
                                ? "Presentation generation failed after multiple attempts. Please try again."
                                : "Presentation update failed after multiple attempts. Please try again.",
                    },
                };
                return;
            }
        }
    }

    async *generatePresentationStream(
        userPrompt: string,
        slideCount = 8,
        detailLevel = "balanced",
        tonality = "professional",
        research?: ResearchOptions,
        researchPayload?: ResearchPayload,
        userId?: string
    ): AsyncGenerator<PresentationStreamEvent, void, unknown> {
        console.log(
            `Starting generate presentation for: ${userPrompt.substring(0, 50)}... with ${slideCount} slides`
        );

        try {
            const systemPrompt = buildGenerationPrompt(detailLevel, tonality);
            const generationMemoryContext = userId
                ? await this.ragService.buildGenerationMemoryContextString(userId, userPrompt)
                : "";

            const effectiveResearch: ResearchOptions | undefined =
                research && typeof research === "object" ? research : undefined;

            let sources: Source[] = [];
            let researchSummary: string | null = null;
            let researchTokensUsed = 0;
            let researchTokensEstimated = 0;

            if (researchPayload && Array.isArray(researchPayload.sources)) {
                sources = researchPayload.sources;
                researchSummary = researchPayload.summary ?? null;
                if (sources.length) {
                    sources = await this.ragService.rankSourcesBySemanticRelevance(
                        userPrompt,
                        sources,
                        8
                    );
                }
            } else {
                if (effectiveResearch?.enabled) {
                    yield {
                        event: "research",
                        data: { status: "searching" },
                    };
                }

                sources = effectiveResearch?.enabled
                    ? await this.searchService.webSearch(userPrompt, {
                          enabled: true,
                          freshness: effectiveResearch.freshness,
                          maxResults: effectiveResearch.maxResults,
                          includeDomains: effectiveResearch.includeDomains,
                          excludeDomains: effectiveResearch.excludeDomains,
                          startPublishedDate: effectiveResearch.startPublishedDate,
                          endPublishedDate: effectiveResearch.endPublishedDate,
                          maxAgeHours: effectiveResearch.maxAgeHours,
                      })
                    : [];

                if (sources.length) {
                    sources = await this.ragService.rankSourcesBySemanticRelevance(
                        userPrompt,
                        sources,
                        8
                    );
                }

                if (effectiveResearch?.enabled) {
                    yield {
                        event: "research",
                        data: { status: "sourced", sources },
                    };
                }

                if (effectiveResearch?.enabled && sources.length === 0) {
                    yield {
                        event: "research",
                        data: { status: "ready" },
                    };
                }

                if (sources.length) {
                    if (effectiveResearch?.enabled) {
                        yield {
                            event: "research",
                            data: { status: "summarizing" },
                        };
                    }
                }

                if (sources.length) {
                    const summaryResult = await this.searchService.summarizeSourcesDetailed(
                        userPrompt,
                        sources
                    );
                    researchSummary = summaryResult.summary;
                    researchTokensUsed = summaryResult.tokensUsed;
                    researchTokensEstimated = summaryResult.tokensEstimated;
                } else {
                    researchSummary = null;
                }

                if (sources.length) {
                    yield {
                        event: "midwayspace",
                        data: { summary: researchSummary, sources },
                    };
                }
            }

            const researchMessage =
                sources.length || researchSummary
                    ? this.buildResearchSystemMessage(sources, userPrompt, researchSummary)
                    : null;

            const messages = [
                { role: "system", content: systemPrompt },
                ...(generationMemoryContext
                    ? [{ role: "system", content: generationMemoryContext } as OpenRouterMessage]
                    : []),
                ...(researchMessage
                    ? [{ role: "system", content: researchMessage } as OpenRouterMessage]
                    : []),
                {
                    role: "user",
                    content: `Create a comprehensive presentation with data visualizations about: ${userPrompt} in ${slideCount} slides.`,
                },
            ];

            const model = process.env["OPEN_ROUTER_MODEL"] || "google/gemma-4-26b-a4b-it:free";

            if (effectiveResearch?.enabled && !researchPayload) {
                yield { event: "research", data: { status: "generating" } };
            }
            yield { event: "start", data: { status: "generating" } };
            const effectiveResearchTokens =
                researchTokensUsed > 0 ? researchTokensUsed : researchTokensEstimated;
            yield* this.streamStructuredPresentation({
                model,
                messages,
                expectedSlideCount: slideCount,
                fallbackTitle: "Untitled Presentation",
                researchTokens: effectiveResearchTokens,
                sources,
                operation: "generation",
            });
        } catch (error) {
            console.error("Error during generation:", error);
            yield {
                event: "error",
                data: { error: "An error occurred while generating the presentation." },
            };
        }
    }

    /**
     * Generate presentation iteration based on user feedback
     */
    async *iteratePresentationStream(
        userId: string,
        presentationId: string,
        feedback: string,
        detailLevel = "balanced",
        tonality = "professional",
        research?: ResearchOptions
    ): AsyncGenerator<PresentationStreamEvent, void, unknown> {
        console.log(
            `Starting presentation iteration with feedback: ${feedback.substring(0, 100)}...`
        );

        try {
            // Retrieve RAG context for this iteration
            const ragContext = await this.ragService.buildRagContextString(
                userId,
                presentationId,
                feedback
            );

            const systemPrompt = buildIterationPrompt(feedback, detailLevel, tonality);
            const enhancedSystemPrompt = ragContext
                ? `${ragContext}\n${systemPrompt}`
                : systemPrompt;

            const effectiveResearch: ResearchOptions | undefined =
                research && typeof research === "object" ? research : undefined;

            if (effectiveResearch?.enabled) {
                yield {
                    event: "research",
                    data: { status: "searching" },
                };
            }

            let sources = effectiveResearch?.enabled
                ? await this.searchService.webSearch(feedback, {
                      enabled: true,
                      freshness: effectiveResearch.freshness,
                      maxResults: effectiveResearch.maxResults,
                      includeDomains: effectiveResearch.includeDomains,
                      excludeDomains: effectiveResearch.excludeDomains,
                      startPublishedDate: effectiveResearch.startPublishedDate,
                      endPublishedDate: effectiveResearch.endPublishedDate,
                      maxAgeHours: effectiveResearch.maxAgeHours,
                  })
                : [];

            if (sources.length) {
                sources = await this.ragService.rankSourcesBySemanticRelevance(
                    feedback,
                    sources,
                    8
                );
            }

            if (effectiveResearch?.enabled) {
                yield {
                    event: "research",
                    data: { status: "sourced", sources },
                };
            }

            if (effectiveResearch?.enabled && sources.length === 0) {
                yield {
                    event: "research",
                    data: { status: "ready" },
                };
            }

            if (sources.length) {
                if (effectiveResearch?.enabled) {
                    yield {
                        event: "research",
                        data: { status: "summarizing" },
                    };
                }
            }

            let researchTokensUsed = 0;
            let researchTokensEstimated = 0;

            let researchSummary: string | null = null;
            if (sources.length) {
                const summaryResult = await this.searchService.summarizeSourcesDetailed(
                    feedback,
                    sources
                );
                researchSummary = summaryResult.summary;
                researchTokensUsed = summaryResult.tokensUsed;
                researchTokensEstimated = summaryResult.tokensEstimated;
            }

            if (sources.length) {
                yield {
                    event: "midwayspace",
                    data: { summary: researchSummary, sources },
                };
            }

            const researchMessage = sources.length
                ? this.buildResearchSystemMessage(sources, feedback, researchSummary)
                : null;

            const messages = [
                { role: "system", content: enhancedSystemPrompt },
                ...(researchMessage
                    ? [{ role: "system", content: researchMessage } as OpenRouterMessage]
                    : []),
                {
                    role: "user",
                    content: `Apply the following changes to the presentation: ${feedback}`,
                },
            ];

            const model = process.env["OPEN_ROUTER_MODEL"] || "google/gemma-4-26b-a4b-it:free";

            if (effectiveResearch?.enabled) {
                yield { event: "research", data: { status: "generating" } };
            }
            yield { event: "start", data: { status: "iterating" } };
            const effectiveResearchTokens =
                researchTokensUsed > 0 ? researchTokensUsed : researchTokensEstimated;
            yield* this.streamStructuredPresentation({
                model,
                messages,
                fallbackTitle: "Updated Presentation",
                researchTokens: effectiveResearchTokens,
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
