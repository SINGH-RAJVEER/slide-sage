import {
    type AIProvider,
    BACKGROUND_FOCAL_POINTS,
    BACKGROUND_OVERLAYS,
    BLOCK_EMPHASES,
    BLOCK_TREATMENTS,
    MAX_WIDGET_EDGES,
    MAX_WIDGET_NODES,
    type OpenRouterMessage,
    PRESENTATION_SCHEMA_VERSION,
    type PresentationJSON,
    type PresentationOutline,
    type PresentationStreamEvent,
    SCENE_ENGINE_VERSION,
    SCENE_PRESENTATION_SCHEMA_VERSION,
    SLIDE_DENSITIES,
    SLIDE_LAYOUTS,
    SLIDE_PATTERNS,
    SLIDE_REGIONS,
    SLIDE_TONES,
    type Slide,
    type Source,
    THEME_IDS,
    type ThemeId,
    WIDGET_DIRECTIONS,
    WIDGET_KINDS,
    WIDGET_NODE_ROLES,
    WIDGET_TONES,
} from "@slidesage/types";
import { abortReason } from "../../utils/abort";
import {
    OpenRouterStreamError,
    readOpenRouterStream,
    requestOpenRouterStream,
} from "../../utils/openrouter-stream";
import { logSafeError } from "../../utils/safe-logging";
import { StreamProcessor } from "../../utils/stream-processor";
import {
    normalizePresentationSlides,
    parsePresentationContent,
    processSlide,
} from "./presentation-content";
import { compilePresentationScenes } from "./presentation-design";

interface OpenRouterEnvironment {
    OPEN_ROUTER_API_BASE?: string;
    OPEN_ROUTER_API_KEY?: string;
}

interface StructuredPresentationOptions {
    provider?: AIProvider;
    apiKey?: string;
    model: string;
    messages: OpenRouterMessage[];
    expectedSlideCount?: number;
    fallbackTitle: string;
    sources: Source[];
    operation: "generation" | "iteration";
    preferredTheme?: ThemeId;
    outline?: PresentationOutline;
    signal?: AbortSignal;
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

async function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const finish = () => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        };
        const timeout = setTimeout(finish, delayMs);
        const onAbort = () => {
            clearTimeout(timeout);
            signal?.removeEventListener("abort", onAbort);
            reject(abortReason(signal as AbortSignal));
        };
        if (signal?.aborted) {
            onAbort();
            return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

export function presentationResponseFormat(expectedSlideCount?: number): Record<string, unknown> {
    const region = { enum: SLIDE_REGIONS };
    const blockSemantics = {
        emphasis: { enum: BLOCK_EMPHASES },
        treatment: { enum: BLOCK_TREATMENTS },
    };
    const blockRequired = ["type", "region", "emphasis", "treatment"];
    const blockSchemas = [
        {
            type: "object",
            properties: {
                type: { const: "paragraph" },
                region,
                text: { type: "string", maxLength: 700 },
                ...blockSemantics,
            },
            required: [...blockRequired, "text"],
            additionalProperties: false,
        },
        {
            type: "object",
            properties: {
                type: { const: "bullets" },
                region,
                items: {
                    type: "array",
                    maxItems: 6,
                    items: { type: "string", maxLength: 180 },
                },
                ordered: { type: "boolean" },
                ...blockSemantics,
            },
            required: [...blockRequired, "items", "ordered"],
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
                ...blockSemantics,
            },
            required: [...blockRequired, "headers", "rows"],
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
                ...blockSemantics,
            },
            required: [...blockRequired, "url", "alt", "caption"],
            additionalProperties: false,
        },
        {
            type: "object",
            properties: {
                type: { const: "image-placeholder" },
                region,
                alt: { type: "string", maxLength: 240 },
                caption: { type: "string", maxLength: 300 },
                ...blockSemantics,
            },
            required: [...blockRequired, "alt", "caption"],
            additionalProperties: false,
        },
        {
            type: "object",
            properties: {
                type: { const: "quote" },
                region,
                text: { type: "string", maxLength: 500 },
                attribution: { type: "string", maxLength: 200 },
                ...blockSemantics,
            },
            required: [...blockRequired, "text", "attribution"],
            additionalProperties: false,
        },
        {
            type: "object",
            properties: {
                type: { const: "callout" },
                region,
                heading: { type: "string", maxLength: 180 },
                text: { type: "string", maxLength: 400 },
                ...blockSemantics,
            },
            required: [...blockRequired, "heading", "text"],
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
                ...blockSemantics,
            },
            required: [...blockRequired, "items"],
            additionalProperties: false,
        },
        {
            type: "object",
            properties: {
                type: { const: "widget" },
                region,
                version: { const: 1 },
                kind: { enum: WIDGET_KINDS },
                direction: { enum: WIDGET_DIRECTIONS },
                nodes: {
                    type: "array",
                    minItems: 2,
                    maxItems: MAX_WIDGET_NODES,
                    items: {
                        type: "object",
                        properties: {
                            id: { type: "string", maxLength: 80 },
                            label: { type: "string", maxLength: 160 },
                            description: { type: "string", maxLength: 400 },
                            value: { type: "string", maxLength: 100 },
                            role: { enum: WIDGET_NODE_ROLES },
                            tone: { enum: WIDGET_TONES },
                            parentId: { type: "string", maxLength: 80 },
                        },
                        required: [
                            "id",
                            "label",
                            "description",
                            "value",
                            "role",
                            "tone",
                            "parentId",
                        ],
                        additionalProperties: false,
                    },
                },
                edges: {
                    type: "array",
                    maxItems: MAX_WIDGET_EDGES,
                    items: {
                        type: "object",
                        properties: {
                            from: { type: "string", maxLength: 80 },
                            to: { type: "string", maxLength: 80 },
                            label: { type: "string", maxLength: 160 },
                        },
                        required: ["from", "to", "label"],
                        additionalProperties: false,
                    },
                },
                ...blockSemantics,
            },
            required: [...blockRequired, "version", "kind", "direction", "nodes", "edges"],
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
                        layout: { enum: SLIDE_LAYOUTS },
                        title: { type: "string", maxLength: 240 },
                        subtitle: { type: "string", maxLength: 400 },
                        eyebrow: { type: "string", maxLength: 120 },
                        regionLabels: {
                            type: "object",
                            properties: {
                                main: { type: "string", maxLength: 80 },
                                primary: { type: "string", maxLength: 80 },
                                secondary: { type: "string", maxLength: 80 },
                                media: { type: "string", maxLength: 80 },
                            },
                            additionalProperties: false,
                        },
                        tone: { enum: SLIDE_TONES },
                        density: { enum: SLIDE_DENSITIES },
                        pattern: { enum: SLIDE_PATTERNS },
                        backgroundImage: {
                            type: "object",
                            properties: {
                                url: { type: "string", maxLength: 2048, pattern: "^https://" },
                                alt: { type: "string", maxLength: 240 },
                                focalPoint: { enum: BACKGROUND_FOCAL_POINTS },
                                overlay: { enum: BACKGROUND_OVERLAYS },
                            },
                            required: ["url", "alt", "focalPoint", "overlay"],
                            additionalProperties: false,
                        },
                        blocks: {
                            type: "array",
                            maxItems: 8,
                            items: { anyOf: blockSchemas },
                        },
                    },
                    required: [
                        "id",
                        "type",
                        "layout",
                        "title",
                        "subtitle",
                        "tone",
                        "density",
                        "pattern",
                        "blocks",
                    ],
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
                    schemaVersion: { const: PRESENTATION_SCHEMA_VERSION },
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
        options.provider === undefined
            ? environment.OPEN_ROUTER_API_BASE || "https://openrouter.ai/api/v1/chat/completions"
            : undefined;
    const apiKey = options.apiKey || environment.OPEN_ROUTER_API_KEY;

    if (!apiKey) {
        yield {
            event: "error",
            data: { error: "The selected AI provider is not configured." },
        };
        return;
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const processor = new StreamProcessor();
        const streamedSlides = new Map<number, Slide>();
        let streamedTheme: ThemeId | undefined;
        let chunkCount = 0;

        try {
            const response = await requestOpenRouterStream({
                endpoint,
                provider: options.provider,
                apiKey,
                model: options.model,
                messages: options.messages,
                requestTimeoutMs,
                maxTokens: outputTokenBudget(options.expectedSlideCount),
                responseFormat: presentationResponseFormat(options.expectedSlideCount),
                signal: options.signal,
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
                        streamedTheme = options.preferredTheme || normalizeTheme(theme);
                        yield {
                            event: "theme",
                            data: { theme: streamedTheme },
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
                    const compiledSlide = options.outline
                        ? compilePresentationScenes([processedSlide], options.outline, index)[0] ||
                          processedSlide
                        : processedSlide;
                    streamedSlides.set(index, compiledSlide);

                    if (processor.titleExtracted === null) {
                        processor.titleExtracted = processor.extractTitleFromSlide(
                            processedSlide as unknown as Record<string, unknown>
                        );
                    }
                    yield {
                        event: "slide",
                        data: {
                            slide: compiledSlide,
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
            const semanticSlides = normalizePresentationSlides(
                parsedContent,
                options.expectedSlideCount
            );
            const slides = options.outline
                ? compilePresentationScenes(semanticSlides, options.outline)
                : semanticSlides;

            if (options.outline) {
                yield {
                    event: "stage",
                    data: {
                        stage: "designing",
                        message: "Selecting layouts and visual structure",
                        completed: 3,
                        total: 4,
                    },
                };
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

            const parsedTitle = typeof parsedContent.title === "string" ? parsedContent.title : "";
            const presentation: PresentationJSON = {
                schemaVersion: options.outline
                    ? SCENE_PRESENTATION_SCHEMA_VERSION
                    : PRESENTATION_SCHEMA_VERSION,
                engineVersion: options.outline ? SCENE_ENGINE_VERSION : undefined,
                dimensions: { width: 1280, height: 720 },
                slides,
                title: processor.titleExtracted || parsedTitle || options.fallbackTitle,
                theme: options.preferredTheme || normalizeTheme(parsedContent["theme"]),
                totalSlides: slides.length,
                tokens_used: processor.currentTotalTokensUsed,
                outline: options.outline,
            };
            if (options.sources.length) {
                presentation.sources = options.sources;
            }

            if (options.outline) {
                yield {
                    event: "stage",
                    data: {
                        stage: "finalizing",
                        message: "Finalizing the presentation",
                        completed: 4,
                        total: 4,
                    },
                };
            }

            yield {
                event: "complete",
                data: presentation,
            };
            return;
        } catch (error) {
            if (options.signal?.aborted) throw abortReason(options.signal);
            const message = error instanceof Error ? error.message : String(error);
            const expectedSlideCount = options.expectedSlideCount;
            const completeStreamedSlides =
                expectedSlideCount === undefined
                    ? []
                    : Array.from({ length: expectedSlideCount }, (_, index) =>
                          streamedSlides.get(index)
                      );

            if (
                expectedSlideCount !== undefined &&
                completeStreamedSlides.every((slide): slide is Slide => slide !== undefined)
            ) {
                const presentation: PresentationJSON = {
                    schemaVersion: options.outline
                        ? SCENE_PRESENTATION_SCHEMA_VERSION
                        : PRESENTATION_SCHEMA_VERSION,
                    engineVersion: options.outline ? SCENE_ENGINE_VERSION : undefined,
                    dimensions: { width: 1280, height: 720 },
                    slides: completeStreamedSlides,
                    title: processor.titleExtracted || options.fallbackTitle,
                    theme: options.preferredTheme || streamedTheme || "corporate-blue",
                    totalSlides: completeStreamedSlides.length,
                    tokens_used: processor.currentTotalTokensUsed,
                    outline: options.outline,
                };
                if (options.sources.length) {
                    presentation.sources = options.sources;
                }

                logSafeError(`${options.operation}_stream_ended_after_complete_deck`, error);
                yield { event: "complete", data: presentation };
                return;
            }

            const retryable = !(error instanceof OpenRouterStreamError) || error.retryable;
            logSafeError(`${options.operation}_stream_attempt_failed`, error);

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
                await wait(delayMs, options.signal);
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
