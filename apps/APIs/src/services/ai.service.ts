import type {
    LiteLLMMessage,
    PresentationStreamEvent,
    ResearchOptions,
    ResearchPayload,
    Slide,
    Source,
} from "@slide-sage/contracts";
import { JSONRecoveryError, recoverJson } from "../utils/json-recovery";
import { StreamProcessor } from "../utils/stream-processor";
import { buildGenerationPrompt, buildIterationPrompt } from "./ai-prompts";
import { RAGService } from "./rag.service";
import { SearchService } from "./search.service";

// Using dynamic import for litellm compatibility
const completion: unknown = null;

async function initLiteLLM() {
    if (!completion) {
        try {
            console.log("AI Service initialized");
        } catch (error) {
            console.warn("LiteLLM SDK not available:", error);
        }
    }
}

export class AIService {
    private searchService = new SearchService();
    private ragService = new RAGService();

    constructor() {
        initLiteLLM();
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

    private getLiteLLMProxyCompletionsUrl(): string | null {
        const explicitUrl = process.env.LITELLM_PROXY_URL;
        if (explicitUrl) return explicitUrl;

        const base = process.env.LITELLM_PROXY_BASE;
        if (!base) return null;

        const trimmed = base.replace(/\/+$/g, "");

        if (trimmed.endsWith("/v1/chat/completions")) return trimmed;
        if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
        return `${trimmed}/v1/chat/completions`;
    }

    private processSlide(slide: Slide, index: number): Slide | null {
        if (!slide || typeof slide !== "object") {
            console.warn(`Invalid slide ${index}, skipping`);
            return null;
        }

        slide.id = slide.id || `slide-${index + 1}`;
        slide.type = slide.type || "content";

        if (slide.type === "chart" && !slide.chartConfig) {
            console.warn(`Chart slide ${index} missing chartConfig, converting to content`);
            slide.type = "content";
            slide.html =
                '<div id="slide-content"><h2 id="slide-title">Data Visualization</h2><p id="slide-description">Chart data unavailable</p></div>';
        } else if (slide.html) {
            const htmlContent = slide.html.trim();
            if (!htmlContent.startsWith('<div id="slide-content">')) {
                slide.html = `<div id="slide-content">${htmlContent}</div>`;
                console.log(`Added slide-content wrapper to slide ${index}`);
            }
        }

        return slide;
    }

    async *generatePresentationStream(
        userPrompt: string,
        slideCount = 8,
        detailLevel = "balanced",
        tonality = "professional",
        research?: ResearchOptions,
        researchPayload?: ResearchPayload
    ): AsyncGenerator<PresentationStreamEvent, void, unknown> {
        console.log(
            `Starting generate presentation for: ${userPrompt.substring(0, 50)}... with ${slideCount} slides`
        );

        try {
            const systemPrompt = buildGenerationPrompt(detailLevel, tonality);

            const effectiveResearch: ResearchOptions | undefined =
                research && typeof research === "object" ? research : undefined;

            let sources: Source[] = [];
            let researchSummary: string | null = null;
            let researchTokensUsed = 0;
            let researchTokensEstimated = 0;

            if (researchPayload && Array.isArray(researchPayload.sources)) {
                sources = researchPayload.sources;
                researchSummary = researchPayload.summary ?? null;
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
                          provider: "brave",
                          freshness: effectiveResearch.freshness,
                          maxResults: effectiveResearch.maxResults,
                      })
                    : [];

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
                ...(researchMessage
                    ? [{ role: "system", content: researchMessage } as LiteLLMMessage]
                    : []),
                {
                    role: "user",
                    content: `Create a comprehensive presentation with data visualizations about: ${userPrompt} in ${slideCount} slides.`,
                },
            ];

            const model = process.env.LITELLM_MODEL || "groq/llama3-8b-8192";

            // Call LiteLLM API via Bun's fetch
            const response = await this.callLiteLLMStreaming(model, messages);

            const processor = new StreamProcessor();

            // Yield initial event
            if (effectiveResearch?.enabled && !researchPayload) {
                yield { event: "research", data: { status: "generating" } };
            }
            yield { event: "start", data: { status: "generating" } };

            let chunkCount = 0;

            // Process streaming response
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                throw new Error("No response body");
            }

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split("\n");

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);
                        if (data === "[DONE]") continue;

                        try {
                            const parsed = JSON.parse(data);
                            chunkCount++;

                            const chunkContent = processor.processChunk(parsed);
                            if (chunkContent) {
                                processor.accumulateContent(chunkContent);
                            }

                            // Extract and yield theme if not yet yielded
                            if (!processor.themeYielded) {
                                const theme = processor.extractTheme();
                                if (theme) {
                                    yield { event: "theme", data: { theme } };
                                }
                            }

                            // Extract and yield any new complete slides
                            const newSlides = processor.extractSlides();
                            for (const { index: idx, slide } of newSlides) {
                                const processedSlide = this.processSlide(slide as Slide, idx);
                                if (processedSlide) {
                                    if (processor.titleExtracted === null) {
                                        processor.titleExtracted =
                                            processor.extractTitleFromSlide(slide);
                                    }

                                    yield {
                                        event: "slide",
                                        data: {
                                            slide: processedSlide,
                                            index: idx,
                                            title: processor.titleExtracted,
                                        },
                                    };
                                }
                            }
                        } catch (_error) {
                            // Skip invalid JSON chunks
                        }
                    }
                }
            }

            // Final processing
            console.log(`Streaming complete. Total chunks: ${chunkCount}`);

            const cleanContent = processor.getCleanContent();
            if (!cleanContent) {
                console.error("No content received from AI model!");
                yield {
                    event: "error",
                    data: {
                        error: "No response received from AI model. Check your API key and model configuration.",
                    },
                };
                return;
            }

            try {
                // biome-ignore lint/suspicious/noExplicitAny: Dynamic JSON response from AI
                let parsedContent: any;
                try {
                    parsedContent = JSON.parse(cleanContent);
                } catch (jsonError) {
                    console.warn("Initial JSON parse failed, attempting recovery...");
                    const recoveryResult = recoverJson(cleanContent, jsonError as Error);
                    parsedContent = recoveryResult.content;
                    console.log(
                        `JSON recovery successful using ${recoveryResult.strategy} strategy`
                    );
                }

                console.log(
                    `Successfully parsed JSON response with ${parsedContent.slides?.length || 0} slides`
                );

                // Process any remaining slides
                if (parsedContent.slides) {
                    for (
                        let idx = processor.currentSlidesYielded;
                        idx < parsedContent.slides.length;
                        idx++
                    ) {
                        const slide = parsedContent.slides[idx];
                        const processedSlide = this.processSlide(slide, idx);
                        if (processedSlide) {
                            processor.currentSlidesYielded = processor.currentSlidesYielded + 1;
                            if (processor.titleExtracted === null) {
                                processor.titleExtracted = processor.extractTitleFromSlide(slide);
                            }
                            yield {
                                event: "slide",
                                data: {
                                    slide: processedSlide,
                                    index: idx,
                                    title: processor.titleExtracted,
                                },
                            };
                        }
                    }
                }

                // Add metadata
                parsedContent.title =
                    processor.titleExtracted || parsedContent.title || "Untitled Presentation";
                if (parsedContent.slides) {
                    parsedContent.totalSlides = parsedContent.slides.length;
                }
                // Include secondary-model research summarization usage in total, when available.
                // If provider doesn't return usage, fall back to our estimate.
                const effectiveResearchTokens =
                    researchTokensUsed > 0 ? researchTokensUsed : researchTokensEstimated;

                parsedContent.research_tokens_used = effectiveResearchTokens;
                parsedContent.tokens_used =
                    processor.currentTotalTokensUsed + effectiveResearchTokens;
                if (sources.length) {
                    parsedContent.sources = sources;
                }

                console.log(
                    `Generation completed. Total tokens used: ${processor.currentTotalTokensUsed} (+${effectiveResearchTokens} research)`
                );

                // Yield completion event
                yield {
                    event: "complete",
                    data: parsedContent,
                };
            } catch (error) {
                console.error("JSON parsing and recovery failed:", error);
                if (error instanceof JSONRecoveryError) {
                    yield {
                        event: "error",
                        data: {
                            error: "AI response could not be recovered. Please try again.",
                        },
                    };
                } else {
                    yield {
                        event: "error",
                        data: { error: "Failed to parse AI response" },
                    };
                }
            }
        } catch (error) {
            console.error("Error during generation:", error);
            yield {
                event: "error",
                data: { error: `An error occurred: ${error}` },
            };
        }
    }

    private async callLiteLLMStreaming(
        model: string,
        messages: LiteLLMMessage[]
    ): Promise<Response> {
        // LiteLLM-first path for Groq models when a proxy URL/base is configured.
        // This preserves provider prefixes (e.g. "groq/llama-3.3-70b-versatile") and
        // enables model alias routing from litellm_config.yaml (e.g. "kimi").
        const proxyUrl = this.getLiteLLMProxyCompletionsUrl();
        const shouldUseProxyForGroq = model.startsWith("groq/") && Boolean(proxyUrl);

        if (shouldUseProxyForGroq && proxyUrl) {
            const proxyKey = process.env.LITELLM_PROXY_KEY || process.env.LITELLM_API_KEY || "";

            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            if (proxyKey) {
                headers.Authorization = `Bearer ${proxyKey}`;
            }

            const response = await fetch(proxyUrl, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model,
                    messages,
                    stream: true,
                    stream_options: { include_usage: true },
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(
                    `LiteLLM proxy request failed: ${response.status} ${response.statusText}`,
                    errorText
                );
                throw new Error(
                    `LiteLLM proxy request failed: ${response.status} ${response.statusText} - ${errorText}`
                );
            }

            return response;
        }

        // Direct provider fallback (OpenAI-compatible endpoints)
        let apiEndpoint = process.env.LITELLM_API_BASE;
        let apiKey = process.env.LITELLM_API_KEY;

        if (model.startsWith("groq/")) {
            apiEndpoint = apiEndpoint || "https://api.groq.com/openai/v1/chat/completions";
            apiKey = apiKey || process.env.GROQ_API_KEY;
        } else if (model.startsWith("gemini/")) {
            apiEndpoint =
                apiEndpoint ||
                "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
            apiKey = apiKey || process.env.GEMINI_API_KEY;
        } else {
            apiEndpoint = apiEndpoint || "https://api.openai.com/v1/chat/completions";
            apiKey = apiKey || process.env.OPENAI_API_KEY;
        }

        if (!apiKey) {
            console.error(`Missing API Key for model ${model}`);
            throw new Error(`Missing API Key for model ${model}`);
        }

        // Extract the actual model name from provider prefix for direct provider calls.
        const modelName = model.includes("/") ? model.split("/").slice(1).join("/") : model;

        const response = await fetch(apiEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: modelName,
                messages,
                stream: true,
                stream_options: { include_usage: true },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(
                `API request failed: ${response.status} ${response.statusText}`,
                errorText
            );
            throw new Error(
                `API request failed: ${response.status} ${response.statusText} - ${errorText}`
            );
        }

        return response;
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

            const sources = effectiveResearch?.enabled
                ? await this.searchService.webSearch(feedback, {
                      enabled: true,
                      provider: "brave",
                      freshness: effectiveResearch.freshness,
                      maxResults: effectiveResearch.maxResults,
                  })
                : [];

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
                    ? [{ role: "system", content: researchMessage } as LiteLLMMessage]
                    : []),
                {
                    role: "user",
                    content: `Apply the following changes to the presentation: ${feedback}`,
                },
            ];

            const model = process.env.LITELLM_MODEL || "groq/llama3-8b-8192";

            // Call LiteLLM API via Bun's fetch
            const response = await this.callLiteLLMStreaming(model, messages);

            const processor = new StreamProcessor();

            // Yield initial event
            if (effectiveResearch?.enabled) {
                yield { event: "research", data: { status: "generating" } };
            }
            yield { event: "start", data: { status: "iterating" } };

            let chunkCount = 0;

            // Process streaming response
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                throw new Error("No response body");
            }

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split("\n");

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);
                        if (data === "[DONE]") enhancedSontinue;

                        try {
                            const parsed = JSON.parse(data);
                            chunkCount++;

                            const chunkContent = processor.processChunk(parsed);
                            if (chunkContent) {
                                processor.accumulateContent(chunkContent);
                            }

                            // Extract and yield theme if not yet yielded
                            if (!processor.themeYielded) {
                                const theme = processor.extractTheme();
                                if (theme) {
                                    yield { event: "theme", data: { theme } };
                                }
                            }

                            // Extract and yield any new complete slides
                            const newSlides = processor.extractSlides();
                            for (const { index: idx, slide } of newSlides) {
                                const processedSlide = this.processSlide(slide as Slide, idx);
                                if (processedSlide) {
                                    if (processor.titleExtracted === null) {
                                        processor.titleExtracted =
                                            processor.extractTitleFromSlide(slide);
                                    }
                                    yield {
                                        event: "slide",
                                        data: {
                                            slide: processedSlide,
                                            index: idx,
                                            title: processor.titleExtracted,
                                        },
                                    };
                                }
                            }
                        } catch (_error) {
                            // Skip invalid JSON chunks
                        }
                    }
                }
            }

            // Final processing
            console.log(`Iteration streaming complete. Total chunks: ${chunkCount}`);

            const cleanContent = processor.getCleanContent();
            if (!cleanContent) {
                console.error("No content received from AI model during iteration!");
                yield {
                    event: "error",
                    data: {
                        error: "No response received from AI model during iteration.",
                    },
                };
                return;
            }

            try {
                // biome-ignore lint/suspicious/noExplicitAny: Dynamic JSON response from AI
                let parsedContent: any;
                try {
                    parsedContent = JSON.parse(cleanContent);
                } catch (jsonError) {
                    console.warn(
                        "Initial JSON parse failed during iteration, attempting recovery..."
                    );
                    const recoveryResult = recoverJson(cleanContent, jsonError as Error);
                    parsedContent = recoveryResult.content;
                    console.log(
                        `JSON recovery successful using ${recoveryResult.strategy} strategy`
                    );
                }

                console.log(
                    `Successfully parsed iteration JSON response with ${parsedContent.slides?.length || 0} slides`
                );

                // Process any remaining slides
                if (parsedContent.slides) {
                    for (
                        let idx = processor.currentSlidesYielded;
                        idx < parsedContent.slides.length;
                        idx++
                    ) {
                        const slide = parsedContent.slides[idx];
                        const processedSlide = this.processSlide(slide, idx);
                        if (processedSlide) {
                            processor.currentSlidesYielded = processor.currentSlidesYielded + 1;
                            yield {
                                event: "slide",
                                data: {
                                    slide: processedSlide,
                                    index: idx,
                                    title: processor.titleExtracted,
                                },
                            };
                        }
                    }
                }

                // Add metadata
                parsedContent.title = parsedContent.title || "Updated Presentation";
                if (parsedContent.slides) {
                    parsedContent.totalSlides = parsedContent.slides.length;
                }
                const effectiveResearchTokens =
                    researchTokensUsed > 0 ? researchTokensUsed : researchTokensEstimated;
                parsedContent.research_tokens_used = effectiveResearchTokens;
                parsedContent.tokens_used =
                    processor.currentTotalTokensUsed + effectiveResearchTokens;
                if (sources.length) {
                    parsedContent.sources = sources;
                }

                console.log(
                    `Iteration completed. Total tokens used: ${processor.currentTotalTokensUsed} (+${effectiveResearchTokens} research)`
                );

                // Yield completion event
                yield {
                    event: "complete",
                    data: parsedContent,
                };
            } catch (error) {
                console.error("JSON parsing and recovery failed during iteration:", error);
                if (error instanceof JSONRecoveryError) {
                    yield {
                        event: "error",
                        data: {
                            error: "AI iteration response could not be recovered. Please try again.",
                        },
                    };
                } else {
                    yield {
                        event: "error",
                        data: { error: "Failed to parse AI iteration response" },
                    };
                }
            }
        } catch (error) {
            console.error("Error during iteration:", error);
            yield {
                event: "error",
                data: { error: `An error occurred during iteration: ${error}` },
            };
        }
    }
}
