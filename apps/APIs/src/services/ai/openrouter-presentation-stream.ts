import type {
    OpenRouterMessage,
    PresentationJSON,
    PresentationStreamEvent,
    Source,
} from "@slide-sage/types";
import {
    OpenRouterStreamError,
    readOpenRouterStream,
    requestOpenRouterStream,
} from "../../utils/openrouter-stream";
import { StreamProcessor } from "../../utils/stream-processor";
import {
    normalizePresentationSlides,
    parsePresentationContent,
    processSlide,
} from "./presentation-content";

interface OpenRouterEnvironment {
    OPEN_ROUTER_API_BASE?: string;
    OPEN_ROUTER_API_KEY?: string;
}

interface StructuredPresentationOptions {
    model: string;
    messages: OpenRouterMessage[];
    expectedSlideCount?: number;
    fallbackTitle: string;
    sources: Source[];
    operation: "generation" | "iteration";
}

function positiveInteger(name: string, fallback: number): number {
    const parsed = Number.parseInt(process.env[name] || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function retryDelay(attempt: number, retryAfterMs?: number): number {
    const baseDelay = positiveInteger("OPEN_ROUTER_RETRY_BASE_DELAY_MS", 1000);
    const maxDelay = positiveInteger("OPEN_ROUTER_RETRY_MAX_DELAY_MS", 30000);
    const exponentialDelay = baseDelay * 2 ** Math.max(0, attempt - 1);
    return Math.min(maxDelay, Math.max(retryAfterMs || 0, exponentialDelay));
}

async function wait(delayMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function* streamStructuredPresentation(
    options: StructuredPresentationOptions
): AsyncGenerator<PresentationStreamEvent, void, unknown> {
    const maxAttempts = positiveInteger("OPEN_ROUTER_MAX_ATTEMPTS", 3);
    const requestTimeoutMs = positiveInteger("OPEN_ROUTER_REQUEST_TIMEOUT_MS", 180000);
    const idleTimeoutMs = positiveInteger("OPEN_ROUTER_STREAM_IDLE_TIMEOUT_MS", 120000);
    const maxResponseBytes = positiveInteger("OPEN_ROUTER_MAX_RESPONSE_BYTES", 8 * 1024 * 1024);
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
                    const processedSlide = processSlide(slide, index);
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

            const parsedContent = parsePresentationContent(cleanContent);
            const slides = normalizePresentationSlides(parsedContent, options.expectedSlideCount);

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

            const parsedTitle = typeof parsedContent.title === "string" ? parsedContent.title : "";
            const presentation: PresentationJSON = {
                ...parsedContent,
                slides,
                title: processor.titleExtracted || parsedTitle || options.fallbackTitle,
                theme:
                    typeof parsedContent["theme"] === "string"
                        ? parsedContent["theme"]
                        : "corporate-blue",
                totalSlides: slides.length,
                tokens_used: processor.currentTotalTokensUsed,
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
                const delayMs = retryDelay(
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
                await wait(delayMs);
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
