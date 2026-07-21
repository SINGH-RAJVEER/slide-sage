import {
    type OpenRouterMessage,
    PRESENTATION_SCHEMA_VERSION,
    type PresentationJSON,
    type PresentationLayoutPreference,
    type PresentationStreamEvent,
    type Source,
    THEME_IDS,
    type ThemeId,
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
    preferredTheme?: ThemeId;
    layoutPreference?: PresentationLayoutPreference;
}

const THEME_ID_SET = new Set<string>(THEME_IDS);

function normalizeTheme(value: unknown): ThemeId {
    return typeof value === "string" && THEME_ID_SET.has(value)
        ? (value as ThemeId)
        : "corporate-blue";
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

function presentationResponseFormat(expectedSlideCount?: number): Record<string, unknown> {
    const region = { enum: ["main", "left", "right"] };
    const blockSchemas = [
        {
            type: "object",
            properties: {
                type: { const: "paragraph" },
                region,
                text: { type: "string", maxLength: 1200 },
            },
            required: ["type", "region", "text"],
            additionalProperties: false,
        },
        {
            type: "object",
            properties: {
                type: { const: "bullets" },
                region,
                items: {
                    type: "array",
                    maxItems: 8,
                    items: { type: "string", maxLength: 350 },
                },
                ordered: { type: "boolean" },
            },
            required: ["type", "region", "items", "ordered"],
            additionalProperties: false,
        },
        {
            type: "object",
            properties: {
                type: { const: "table" },
                region,
                headers: {
                    type: "array",
                    minItems: 1,
                    maxItems: 6,
                    items: { type: "string", maxLength: 120 },
                },
                rows: {
                    type: "array",
                    maxItems: 8,
                    items: {
                        type: "array",
                        maxItems: 6,
                        items: { type: "string", maxLength: 180 },
                    },
                },
            },
            required: ["type", "region", "headers", "rows"],
            additionalProperties: false,
        },
        {
            type: "object",
            properties: {
                type: { const: "image" },
                region,
                url: { type: "string", maxLength: 2048 },
                alt: { type: "string", maxLength: 240 },
                caption: { type: "string", maxLength: 300 },
            },
            required: ["type", "region", "url", "alt", "caption"],
            additionalProperties: false,
        },
        {
            type: "object",
            properties: {
                type: { const: "image-placeholder" },
                region,
                alt: { type: "string", maxLength: 240 },
                caption: { type: "string", maxLength: 300 },
            },
            required: ["type", "region", "alt", "caption"],
            additionalProperties: false,
        },
        {
            type: "object",
            properties: {
                type: { const: "quote" },
                region,
                text: { type: "string", maxLength: 800 },
                attribution: { type: "string", maxLength: 200 },
            },
            required: ["type", "region", "text", "attribution"],
            additionalProperties: false,
        },
        {
            type: "object",
            properties: {
                type: { const: "callout" },
                region,
                heading: { type: "string", maxLength: 180 },
                text: { type: "string", maxLength: 700 },
            },
            required: ["type", "region", "heading", "text"],
            additionalProperties: false,
        },
        {
            type: "object",
            properties: {
                type: { const: "stats" },
                region,
                items: {
                    type: "array",
                    maxItems: 6,
                    items: {
                        type: "object",
                        properties: {
                            value: { type: "string", maxLength: 80 },
                            label: { type: "string", maxLength: 160 },
                        },
                        required: ["value", "label"],
                        additionalProperties: false,
                    },
                },
            },
            required: ["type", "region", "items"],
            additionalProperties: false,
        },
    ];
    const slidesSchema: Record<string, unknown> = {
        type: "array",
        minItems: expectedSlideCount ?? 1,
        items: {
            anyOf: [
                {
                    type: "object",
                    properties: {
                        id: { type: "string", maxLength: 120 },
                        type: { const: "content" },
                        layout: {
                            enum: ["title", "content", "two-column", "quote", "image-right"],
                        },
                        title: { type: "string", maxLength: 240 },
                        subtitle: { type: "string", maxLength: 400 },
                        blocks: {
                            type: "array",
                            maxItems: 12,
                            items: { anyOf: blockSchemas },
                        },
                    },
                    required: ["id", "type", "layout", "title", "subtitle", "blocks"],
                    additionalProperties: false,
                },
                {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        type: { const: "chart" },
                        chartConfig: {
                            type: "object",
                            properties: {
                                type: {
                                    enum: ["bar", "line", "pie", "doughnut", "radar", "polarArea"],
                                },
                                title: { type: "string" },
                                description: { type: "string" },
                                data: {
                                    type: "object",
                                    properties: {
                                        labels: {
                                            type: "array",
                                            maxItems: 20,
                                            items: { type: "string" },
                                        },
                                        datasets: {
                                            type: "array",
                                            maxItems: 6,
                                            items: {
                                                type: "object",
                                                properties: {
                                                    label: { type: "string" },
                                                    data: {
                                                        type: "array",
                                                        maxItems: 20,
                                                        items: { type: "number" },
                                                    },
                                                    backgroundColor: {
                                                        anyOf: [
                                                            { type: "string" },
                                                            {
                                                                type: "array",
                                                                items: { type: "string" },
                                                            },
                                                        ],
                                                    },
                                                    borderColor: {
                                                        anyOf: [
                                                            { type: "string" },
                                                            {
                                                                type: "array",
                                                                items: { type: "string" },
                                                            },
                                                        ],
                                                    },
                                                    borderWidth: { type: "number" },
                                                },
                                                required: [
                                                    "label",
                                                    "data",
                                                    "backgroundColor",
                                                    "borderColor",
                                                    "borderWidth",
                                                ],
                                                additionalProperties: false,
                                            },
                                        },
                                    },
                                    required: ["labels", "datasets"],
                                    additionalProperties: false,
                                },
                                options: {
                                    type: "object",
                                    properties: {},
                                    additionalProperties: false,
                                },
                            },
                            required: ["type", "title", "description", "data", "options"],
                            additionalProperties: false,
                        },
                    },
                    required: ["id", "type", "chartConfig"],
                    additionalProperties: false,
                },
            ],
        },
    };

    if (expectedSlideCount !== undefined) {
        slidesSchema["maxItems"] = expectedSlideCount;
    }

    return {
        type: "json_schema",
        json_schema: {
            name: "presentation",
            strict: true,
            schema: {
                type: "object",
                properties: {
                    schemaVersion: { const: 2 },
                    title: { type: "string" },
                    theme: {
                        enum: [
                            "modern-dark",
                            "corporate-blue",
                            "minimalist",
                            "creative-studio",
                            "elegant-serif",
                            "nature-green",
                        ],
                    },
                    slides: slidesSchema,
                    totalSlides:
                        expectedSlideCount === undefined
                            ? { type: "integer", minimum: 1 }
                            : { const: expectedSlideCount },
                },
                required: ["schemaVersion", "title", "theme", "slides", "totalSlides"],
                additionalProperties: false,
            },
        },
    };
}

function outputTokenBudget(expectedSlideCount?: number): number {
    const maximum = positiveInteger("OPEN_ROUTER_MAX_OUTPUT_TOKENS", 32768);
    if (expectedSlideCount === undefined) return maximum;

    return Math.min(maximum, Math.max(4096, expectedSlideCount * 2048));
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
                maxTokens: outputTokenBudget(options.expectedSlideCount),
                responseFormat: presentationResponseFormat(options.expectedSlideCount),
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
                        yield {
                            event: "theme",
                            data: { theme: options.preferredTheme || normalizeTheme(theme) },
                        };
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
                        processor.titleExtracted = processor.extractTitleFromSlide(
                            processedSlide as unknown as Record<string, unknown>
                        );
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
                schemaVersion: PRESENTATION_SCHEMA_VERSION,
                slides,
                title: processor.titleExtracted || parsedTitle || options.fallbackTitle,
                theme: options.preferredTheme || normalizeTheme(parsedContent["theme"]),
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
