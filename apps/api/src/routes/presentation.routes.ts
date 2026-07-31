import {
    type AIModelSelection,
    PRESENTATION_SCHEMA_VERSION,
    type PresentationJSON,
    type PresentationMutationRequest,
    type PresentationResponse,
    type PresentationSummary,
    type ResearchOptions,
    type ResearchPayload,
    SCENE_ENGINE_VERSION,
    SCENE_PRESENTATION_SCHEMA_VERSION,
    type Slide,
    type Source,
    THEME_IDS,
    type ThemeId,
} from "@slidesage/types";
import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { PresentationRepository } from "@/database";
import { userRateLimit } from "../middleware/rate-limit";
import { configuredOpenRouterModel } from "../services/ai/model-catalog";
import { AIConnectionService } from "../services/ai-connections.service";
import { authMiddleware, ensureUserInDbMiddleware, getCurrentUserId } from "../services/auth";
import {
    GenerationPointAccountingService,
    InsufficientGenerationPointsError,
    PresentationFinalizationConflictError,
} from "../services/generation-point-accounting.service";
import { PresentationService } from "../services/presentation.service";
import {
    normalizePresentationDocument,
    parsePresentationMutationRequest,
} from "../services/presentation-document";
import { SearchService } from "../services/search.service";
import { trackedStream } from "../utils/response-lifecycle";
import { logSafeError } from "../utils/safe-logging";

interface ResearchOptionsInput {
    enabled?: unknown;
    freshness?: unknown;
    maxResults?: unknown;
    includeDomains?: unknown;
    excludeDomains?: unknown;
    startPublishedDate?: unknown;
    endPublishedDate?: unknown;
    maxAgeHours?: unknown;
}

interface ResearchSourceInput {
    url?: unknown;
    title?: unknown;
    snippet?: unknown;
    retrieved_at?: unknown;
    published_date?: unknown;
    publishedDate?: unknown;
    author?: unknown;
    highlights?: unknown;
    summary?: unknown;
}

interface ResearchPayloadInput {
    sources?: unknown;
    estimated_tokens?: unknown;
}

const MAX_GENERATION_BODY_BYTES = 256 * 1024;
const MAX_RESEARCH_BODY_BYTES = 32 * 1024;
const MAX_ITERATION_BODY_BYTES = 32 * 1024;
const MAX_MUTATION_BODY_BYTES = 1024 * 1024;
const MAX_RESEARCH_PAYLOAD_BYTES = 128 * 1024;
const DETAIL_LEVELS = new Set(["brief", "concise", "balanced", "detailed", "comprehensive"]);
const TONALITIES = new Set(["casual", "professional", "enthusiastic", "persuasive"]);
const generationRateLimit = userRateLimit("presentation:generation", 6, 60);
const iterationRateLimit = userRateLimit("presentation:iteration", 12, 60);
const researchRateLimit = userRateLimit("presentation:research", 20, 60);
const limitedBody = (maxSize: number) =>
    bodyLimit({
        maxSize,
        onError: (c) => c.json({ error: { message: "Request body is too large" } }, 413),
    });

class RequestInputError extends Error {
    readonly status: 400 | 413;

    constructor(message: string, status: 400 | 413 = 400) {
        super(message);
        this.name = "RequestInputError";
        this.status = status;
    }
}

function inputError(message: string, status: 400 | 413 = 400): never {
    throw new RequestInputError(message, status);
}

function isRecord(input: unknown): input is Record<string, unknown> {
    return input !== null && typeof input === "object" && !Array.isArray(input);
}

function aliasedField(input: Record<string, unknown>, ...fields: string[]): unknown {
    for (const field of fields) {
        if (Object.hasOwn(input, field)) return input[field];
    }
    return undefined;
}

async function readJsonBody(c: Context, maximumBytes: number): Promise<Record<string, unknown>> {
    const contentLength = c.req.header("content-length");
    if (contentLength) {
        const parsedLength = Number(contentLength);
        if (!Number.isFinite(parsedLength) || parsedLength < 0) {
            inputError("Invalid Content-Length header");
        }
        if (parsedLength > maximumBytes) inputError("Request body is too large", 413);
    }

    const raw = await c.req.text();
    if (new TextEncoder().encode(raw).byteLength > maximumBytes) {
        inputError("Request body is too large", 413);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        inputError("Invalid JSON body");
    }
    if (!isRecord(parsed)) inputError("Request body must be a JSON object");
    return parsed;
}

function parseRequiredText(input: unknown, field: string): string {
    if (typeof input !== "string") inputError(`${field} must be a string`);
    const value = input.trim();
    if (value.length < 1 || value.length > 400) {
        inputError(`${field} must contain between 1 and 400 characters`);
    }
    return value;
}

function parseSlideCount(input: unknown, required: boolean): number | undefined {
    if (input === undefined && !required) return undefined;
    if (!Number.isInteger(input) || (input as number) < 1 || (input as number) > 40) {
        inputError("slide_count must be an integer between 1 and 40");
    }
    return input as number;
}

function parseKnownValue(
    input: unknown,
    field: string,
    allowed: Set<string>,
    fallback: string
): string {
    if (input === undefined) return fallback;
    if (typeof input !== "string" || !allowed.has(input)) {
        inputError(`Invalid ${field}`);
    }
    return input;
}

function parseBoundedInteger(
    input: unknown,
    field: string,
    minimum: number,
    maximum: number
): number | undefined {
    if (input === undefined) return undefined;
    if (!Number.isInteger(input) || (input as number) < minimum || (input as number) > maximum) {
        inputError(`${field} must be an integer between ${minimum} and ${maximum}`);
    }
    return input as number;
}

function parseDate(input: unknown, field: string): string | undefined {
    if (input === undefined) return undefined;
    if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        inputError(`${field} must use YYYY-MM-DD format`);
    }
    const date = new Date(`${input}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input) {
        inputError(`${field} must be a valid date`);
    }
    return input;
}

function parseResearchOptions(input: unknown): ResearchOptions {
    if (!isRecord(input)) inputError("research must be an object");

    const value = input as ResearchOptionsInput;
    if (typeof value.enabled !== "boolean") {
        inputError("research.enabled must be a boolean");
    }
    const enabled = value.enabled;

    const freshnessRaw = value.freshness;
    if (
        freshnessRaw !== undefined &&
        freshnessRaw !== "day" &&
        freshnessRaw !== "week" &&
        freshnessRaw !== "month" &&
        freshnessRaw !== "year"
    ) {
        inputError("Invalid research freshness");
    }
    const freshness = freshnessRaw as ResearchOptions["freshness"];
    const maxResults = parseBoundedInteger(value.maxResults, "research.maxResults", 1, 8);
    const includeDomains = parseStringList(
        value.includeDomains,
        "research.includeDomains",
        10,
        253
    );
    const excludeDomains = parseStringList(
        value.excludeDomains,
        "research.excludeDomains",
        10,
        253
    );
    const startPublishedDate = parseDate(value.startPublishedDate, "research.startPublishedDate");
    const endPublishedDate = parseDate(value.endPublishedDate, "research.endPublishedDate");
    if (startPublishedDate && endPublishedDate && startPublishedDate > endPublishedDate) {
        inputError("research.startPublishedDate cannot be after research.endPublishedDate");
    }
    const maxAgeHours = parseBoundedInteger(value.maxAgeHours, "research.maxAgeHours", 0, 8760);
    if (!enabled) return { enabled: false };

    return {
        enabled: true,
        freshness,
        maxResults,
        includeDomains,
        excludeDomains,
        startPublishedDate,
        endPublishedDate,
        maxAgeHours,
    };
}

function parseStringList(
    input: unknown,
    field: string,
    maximumItems: number,
    maximumLength: number
): string[] | undefined {
    if (input === undefined) return undefined;
    if (!Array.isArray(input) || input.length > maximumItems) {
        inputError(`${field} must contain at most ${maximumItems} items`);
    }
    const values = input.map((item) => {
        if (typeof item !== "string") inputError(`${field} must contain only strings`);
        const value = item.trim();
        if (value.length < 1 || value.length > maximumLength) {
            inputError(`${field} entries must contain between 1 and ${maximumLength} characters`);
        }
        return value;
    });
    return values.length ? values : undefined;
}

function parseOptionalSourceText(
    input: unknown,
    field: string,
    maximumLength: number
): string | undefined {
    if (input === undefined) return undefined;
    if (typeof input !== "string") inputError(`${field} must be a string`);
    const value = input.trim();
    if (value.length > maximumLength) inputError(`${field} is too long`);
    return value || undefined;
}

function parseResearchPayload(input: unknown): ResearchPayload {
    if (!isRecord(input)) inputError("research_payload must be an object");
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_RESEARCH_PAYLOAD_BYTES) {
        inputError("research_payload is too large");
    }

    const value = input as ResearchPayloadInput;
    const sourcesRaw = value.sources;
    if (!Array.isArray(sourcesRaw) || sourcesRaw.length > 8) {
        inputError("research_payload.sources must contain at most 8 sources");
    }

    const sources: Source[] = [];
    for (const [index, source] of sourcesRaw.entries()) {
        if (!isRecord(source)) inputError(`research_payload.sources[${index}] must be an object`);
        const src = source as ResearchSourceInput;
        if (typeof src.url !== "string") {
            inputError(`research_payload.sources[${index}].url must be a string`);
        }
        const url = src.url.trim();
        if (url.length < 1 || url.length > 2048) {
            inputError(`research_payload.sources[${index}].url is invalid`);
        }
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch {
            inputError(`research_payload.sources[${index}].url must be an HTTP(S) URL`);
        }
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
            inputError(`research_payload.sources[${index}].url must be an HTTP(S) URL`);
        }
        sources.push({
            url,
            title: parseOptionalSourceText(
                src.title,
                `research_payload.sources[${index}].title`,
                500
            ),
            snippet: parseOptionalSourceText(
                src.snippet,
                `research_payload.sources[${index}].snippet`,
                2000
            ),
            retrieved_at: parseOptionalSourceText(
                src.retrieved_at,
                `research_payload.sources[${index}].retrieved_at`,
                64
            ),
            published_date: parseOptionalSourceText(
                aliasedField(source, "published_date", "publishedDate"),
                `research_payload.sources[${index}].published_date`,
                64
            ),
            author: parseOptionalSourceText(
                src.author,
                `research_payload.sources[${index}].author`,
                200
            ),
            highlights: parseStringList(
                src.highlights,
                `research_payload.sources[${index}].highlights`,
                8,
                1200
            ),
            summary: parseOptionalSourceText(
                src.summary,
                `research_payload.sources[${index}].summary`,
                4000
            ),
        });
    }

    const estimatedTokens = value.estimated_tokens;
    if (
        estimatedTokens !== undefined &&
        (typeof estimatedTokens !== "number" ||
            !Number.isFinite(estimatedTokens) ||
            estimatedTokens < 0 ||
            estimatedTokens > 1_000_000)
    ) {
        inputError("research_payload.estimated_tokens is invalid");
    }
    return {
        sources,
        ...(typeof estimatedTokens === "number" ? { estimated_tokens: estimatedTokens } : {}),
    };
}

function parsePaginationValue(
    input: string | undefined,
    field: string,
    fallback: number,
    minimum: number,
    maximum: number
): number {
    if (input === undefined) return fallback;
    if (!/^\d+$/.test(input)) inputError(`${field} must be an integer`);
    const value = Number(input);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        inputError(`${field} must be between ${minimum} and ${maximum}`);
    }
    return value;
}

function positiveIntegerEnv(name: string, fallback: number): number {
    const parsed = Number.parseInt(process.env[name] || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const THEME_ID_SET = new Set<string>(THEME_IDS);

function parseTheme(value: unknown): ThemeId {
    return typeof value === "string" && THEME_ID_SET.has(value)
        ? (value as ThemeId)
        : "corporate-blue";
}

function sseFrame(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const presentations = new Hono();
const presentationService = new PresentationService();
const presentationRepo = new PresentationRepository();
const searchService = new SearchService();
const aiConnectionService = new AIConnectionService();
const pointAccountingService = new GenerationPointAccountingService();

function parseAISelection(value: unknown): AIModelSelection | undefined {
    if (value === undefined) return undefined;
    if (!value || typeof value !== "object") inputError("ai must be an object");
    const selection = value as { provider?: unknown; model?: unknown };
    if (
        (selection.provider !== "openai" &&
            selection.provider !== "google" &&
            selection.provider !== "anthropic") ||
        typeof selection.model !== "string" ||
        selection.model.trim().length === 0 ||
        selection.model.length > 200
    ) {
        inputError("Invalid AI selection");
    }
    return { provider: selection.provider, model: selection.model.trim() };
}

function requestErrorResponse(c: Context, error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
        error instanceof RequestInputError
            ? error.status
            : error instanceof Error && error.name === "BodyLimitError"
              ? 413
              : 400;
    return c.json({ error: { message } }, status);
}

function byokError(c: Context, error: unknown) {
    if (error instanceof Error && error.name === "BYOKPointsRequiredError") {
        return c.json(
            {
                error: { message: error.message, code: "BYOK_POINTS_REQUIRED" },
                minimum_points_exclusive: 50,
            },
            403
        );
    }
    return c.json(
        {
            error: {
                message: error instanceof Error ? error.message : "AI provider unavailable",
                code: "AI_CONNECTION_REQUIRED",
            },
        },
        409
    );
}

function insufficientPointsError(c: Context, error: InsufficientGenerationPointsError) {
    return c.json(
        {
            error: { message: error.message, code: "INSUFFICIENT_TOKENS" },
            slide_tokens_remaining: error.balance,
            slide_tokens_required: error.required,
            slide_tokens_shortfall: error.shortfall,
        },
        402
    );
}

interface FailedPresentationInput {
    presentationId: string;
    userId: string;
    expectedRevision?: number;
    topic: unknown;
    slideCount: unknown;
    detailLevel: string;
    tonality: string;
    researchEnabled: boolean;
    theme: ThemeId;
    researchPayload?: ResearchPayload;
    sources?: Source[];
    estimatedTokens: number;
    message: string;
    ai?: AIModelSelection;
}

async function markPresentationFailed({
    presentationId,
    userId,
    expectedRevision,
    topic,
    slideCount,
    detailLevel,
    tonality,
    researchEnabled,
    theme,
    researchPayload,
    sources,
    estimatedTokens,
    message,
    ai,
}: FailedPresentationInput): Promise<void> {
    const prompt = String(topic).trim();
    const retrySources = sources?.length ? sources : researchPayload?.sources;
    const failedTitle = (prompt || "Failed presentation").slice(0, 255);
    const parsedSlideCount = Number(slideCount);
    const retrySlideCount =
        Number.isFinite(parsedSlideCount) && parsedSlideCount > 0
            ? Math.floor(parsedSlideCount)
            : 5;
    const failedData: PresentationJSON = {
        schemaVersion: PRESENTATION_SCHEMA_VERSION,
        title: failedTitle,
        theme,
        slides: [],
        totalSlides: 0,
        status: "failed",
        failure: {
            message,
            retry: {
                prompt,
                slide_count: retrySlideCount,
                detail_level: detailLevel,
                tonality,
                research_enabled: researchEnabled,
                theme,
                ...(ai
                    ? {
                          ai: {
                              provider: ai.provider,
                              model: ai.model,
                          },
                      }
                    : {}),
                ...(retrySources?.length
                    ? {
                          research_payload: {
                              sources: retrySources,
                              estimated_tokens: estimatedTokens,
                          },
                      }
                    : {}),
            },
        },
    };

    try {
        const updates = {
            title: failedTitle,
            prompt,
            slidesData: failedData,
        };
        const updated =
            expectedRevision !== undefined
                ? await presentationRepo.updateOwnedAtRevision(
                      presentationId,
                      userId,
                      expectedRevision,
                      updates
                  )
                : await presentationRepo.update(presentationId, updates);
        if (!updated) {
            console.warn(
                `Skipped stale failure update for presentation ${presentationId}; a newer revision exists.`
            );
        }
    } catch (error) {
        logSafeError("presentation_failure_state_write_failed", error);
    }
}

// Generate presentation with streaming
presentations.post(
    "/generate-presentation-stream",
    limitedBody(MAX_GENERATION_BODY_BYTES),
    authMiddleware,
    generationRateLimit,
    ensureUserInDbMiddleware,
    async (c) => {
        try {
            const userId = getCurrentUserId(c);
            const body = await readJsonBody(c, MAX_GENERATION_BODY_BYTES);
            const topic = parseRequiredText(body["topic"], "topic");
            const slideCount = parseSlideCount(
                aliasedField(body, "slide_count", "slideCount"),
                true
            ) as number;
            const detailLevel = parseKnownValue(
                aliasedField(body, "detail_level", "detailLevel"),
                "detail_level",
                DETAIL_LEVELS,
                "balanced"
            );
            const tonality = parseKnownValue(
                body["tonality"],
                "tonality",
                TONALITIES,
                "professional"
            );
            const preferredTheme = parseTheme(body["theme"]);
            const research =
                body["research"] === undefined ? undefined : parseResearchOptions(body["research"]);
            const researchPayloadInput = aliasedField(body, "research_payload", "researchPayload");
            const researchPayload =
                researchPayloadInput === undefined
                    ? undefined
                    : parseResearchPayload(researchPayloadInput);
            const retryPresentationIdInput = aliasedField(
                body,
                "retry_presentation_id",
                "retryPresentationId"
            );
            if (
                retryPresentationIdInput !== undefined &&
                (typeof retryPresentationIdInput !== "string" ||
                    retryPresentationIdInput.trim().length === 0 ||
                    retryPresentationIdInput.length > 200)
            ) {
                inputError("retry_presentation_id must be a non-empty string");
            }
            const retryPresentationId =
                typeof retryPresentationIdInput === "string"
                    ? retryPresentationIdInput.trim()
                    : undefined;

            const requestedAI = parseAISelection(body["ai"]);
            let ai: (AIModelSelection & { apiKey: string }) | undefined;
            try {
                ai = await aiConnectionService.resolveSelection(userId, requestedAI);
            } catch (error) {
                return byokError(c, error);
            }

            const estimatedTokens = !ai
                ? presentationService.calculateEstimatedTokens(
                      slideCount,
                      detailLevel,
                      tonality,
                      topic,
                      researchPayload
                  )
                : 0;
            const operationId = crypto.randomUUID();
            let presentationId: string;
            let expectedRevision: number | undefined;
            let pointReservationActive = false;
            let startingBalance: number;
            if (retryPresentationId) {
                const failedPresentation = await presentationService.getPresentation(
                    retryPresentationId,
                    userId
                );
                const failedData = failedPresentation.slidesData as PresentationJSON;
                if (failedData.status !== "failed") {
                    return c.json(
                        { error: { message: "Only failed presentations can be retried" } },
                        409
                    );
                }
                presentationId = failedPresentation.id;
                expectedRevision = failedPresentation.revision;
                try {
                    const reservation = await pointAccountingService.reserveExistingPresentation({
                        operationId,
                        userId,
                        presentationId,
                        kind: "generation",
                        quotedPoints: estimatedTokens,
                    });
                    startingBalance = reservation.balance;
                    pointReservationActive = true;
                } catch (error) {
                    if (error instanceof InsufficientGenerationPointsError) {
                        return insufficientPointsError(c, error);
                    }
                    throw error;
                }
            } else {
                const initialData: PresentationJSON = {
                    schemaVersion: PRESENTATION_SCHEMA_VERSION,
                    slides: [],
                    theme: preferredTheme,
                    title: "Generating...",
                    status: "generating",
                };
                try {
                    const reservation = await pointAccountingService.reserveNewPresentation({
                        operationId,
                        userId,
                        title: "Generating...",
                        prompt: topic,
                        slidesData: initialData,
                        quotedPoints: estimatedTokens,
                    });
                    presentationId = reservation.presentation.id;
                    expectedRevision = reservation.presentation.revision;
                    startingBalance = reservation.balance;
                    pointReservationActive = true;
                } catch (error) {
                    if (error instanceof InsufficientGenerationPointsError) {
                        return insufficientPointsError(c, error);
                    }
                    throw error;
                }
            }

            c.header("Content-Type", "text/event-stream; charset=utf-8");
            c.header("Cache-Control", "no-cache, no-transform");
            c.header("X-Accel-Buffering", "no");
            return trackedStream(c, async (stream) => {
                const cancellation = new AbortController();
                const onRequestAbort = () => cancellation.abort(c.req.raw.signal.reason);
                if (c.req.raw.signal.aborted) onRequestAbort();
                else c.req.raw.signal.addEventListener("abort", onRequestAbort, { once: true });
                stream.onAbort(() =>
                    cancellation.abort(new DOMException("SSE closed", "AbortError"))
                );
                const keepAlive = setInterval(
                    () => {
                        void stream.write(": keepalive\n\n").catch(() => undefined);
                    },
                    positiveIntegerEnv("SSE_KEEPALIVE_INTERVAL_MS", 10000)
                );
                let sources: Source[] | undefined = researchPayload?.sources;
                let finalized = false;
                let reservationReleased = !pointReservationActive;
                let failureSaved = false;
                let lastLeaseRenewal = Date.now();

                const refundReservation = async () => {
                    if (reservationReleased) return;
                    await pointAccountingService.refund(operationId, userId);
                    reservationReleased = true;
                };

                const saveFailure = async (message: string) => {
                    if (!failureSaved) {
                        failureSaved = true;
                        await markPresentationFailed({
                            presentationId,
                            userId,
                            expectedRevision,
                            topic,
                            slideCount,
                            detailLevel,
                            tonality,
                            researchEnabled: Boolean(research?.enabled || sources?.length),
                            theme: preferredTheme,
                            researchPayload,
                            sources,
                            estimatedTokens,
                            message,
                            ai,
                        });
                    }
                    await refundReservation();
                };

                try {
                    await stream.write(sseFrame("created", { presentation_id: presentationId }));
                    const allSlides: Slide[] = [];
                    let theme: string = preferredTheme;
                    let title = "Untitled Presentation";
                    let tokensUsed = 0;
                    let completedDocument: PresentationJSON | undefined;
                    let generationCompleted = false;
                    let generationFailed = false;
                    let failureMessage = "Presentation generation failed. Please try again.";

                    // Stream presentation generation
                    for await (const event of presentationService.generatePresentationStream({
                        userId,
                        operationId,
                        topic,
                        slideCount,
                        detailLevel,
                        tonality,
                        research,
                        researchPayload,
                        theme: preferredTheme,
                        ai,
                        signal: cancellation.signal,
                    })) {
                        if (Date.now() - lastLeaseRenewal >= 5 * 60 * 1000) {
                            await pointAccountingService.renew(operationId, userId);
                            lastLeaseRenewal = Date.now();
                        }
                        const eventType = event.event || "data";
                        // biome-ignore lint/suspicious/noExplicitAny: Data varies by event type
                        const eventData = (event as any).data || {};

                        // Accumulate data
                        if (eventType === "theme") {
                            theme = eventData.theme || theme;
                        }

                        if (eventType === "retry") {
                            allSlides.length = 0;
                            theme = preferredTheme;
                            title = "Untitled Presentation";
                            tokensUsed = 0;
                            completedDocument = undefined;
                            generationCompleted = false;
                        }

                        if (eventType === "research" && Array.isArray(eventData.sources)) {
                            sources = eventData.sources;
                        }

                        if (eventType === "slide") {
                            const slide = eventData.slide;
                            if (slide) {
                                const index = Number(eventData.index);
                                if (Number.isInteger(index) && index >= 0) {
                                    allSlides[index] = slide;
                                } else {
                                    const existingIndex = allSlides.findIndex(
                                        (existing) => existing.id === slide.id
                                    );
                                    if (existingIndex >= 0) allSlides[existingIndex] = slide;
                                    else allSlides.push(slide);
                                }
                            }
                            if (eventData.title) {
                                title = eventData.title;
                            }
                        }

                        if (eventType === "complete") {
                            generationCompleted = true;
                            completedDocument = eventData as PresentationJSON;
                            if (eventData.slides) {
                                allSlides.length = 0;
                                allSlides.push(...eventData.slides);
                            }
                            if (eventData.theme) {
                                theme = eventData.theme;
                            }
                            if (eventData.title) {
                                title = eventData.title;
                            }
                            if (Array.isArray(eventData.sources)) {
                                sources = eventData.sources;
                            }
                            tokensUsed = eventData.tokens_used || 0;
                        }

                        if (eventType === "error") {
                            generationFailed = true;
                            failureMessage =
                                typeof eventData.error === "string"
                                    ? eventData.error
                                    : failureMessage;
                            await saveFailure(failureMessage);
                        }

                        await stream.write(
                            sseFrame(
                                eventType,
                                eventType === "error"
                                    ? { ...eventData, presentation_id: presentationId }
                                    : eventData
                            )
                        );
                    }

                    if (generationFailed || !generationCompleted) {
                        if (!generationFailed) {
                            failureMessage =
                                "Presentation generation ended before completion. Please try again.";
                        }
                        await saveFailure(failureMessage);
                        if (!generationFailed) {
                            await stream.write(
                                sseFrame("error", {
                                    error: failureMessage,
                                    presentation_id: presentationId,
                                })
                            );
                        }
                        return;
                    }

                    if (allSlides.length > 0) {
                        const finalTitle = (() => {
                            const trimmed = typeof title === "string" ? title.trim() : "";
                            const fromTopic = typeof topic === "string" ? topic.trim() : "";

                            const candidate =
                                trimmed && trimmed !== "Untitled Presentation"
                                    ? trimmed
                                    : fromTopic || "Untitled Presentation";

                            // DB schema sets varchar(255)
                            return candidate.slice(0, 255);
                        })();

                        const finalData: PresentationJSON = {
                            ...completedDocument,
                            schemaVersion: allSlides.every((slide) => slide.type === "scene")
                                ? SCENE_PRESENTATION_SCHEMA_VERSION
                                : PRESENTATION_SCHEMA_VERSION,
                            engineVersion: allSlides.every((slide) => slide.type === "scene")
                                ? SCENE_ENGINE_VERSION
                                : completedDocument?.["engineVersion"],
                            dimensions: completedDocument?.dimensions || {
                                width: 1280,
                                height: 720,
                            },
                            slides: allSlides,
                            theme,
                            title: finalTitle,
                            status: "ready",
                            totalSlides: allSlides.length,
                            tokens_used: tokensUsed,
                        };

                        if (sources?.length) {
                            finalData.sources = sources;
                        }

                        const chargedTokens = ai
                            ? 0
                            : presentationService.calculateActualTokenCost(
                                  tokensUsed,
                                  estimatedTokens
                              );
                        const finalUpdates = {
                            title: finalTitle,
                            prompt: topic,
                            slidesData: finalData,
                            aiProvider: ai?.provider || "openrouter",
                            aiModel: ai?.model || configuredOpenRouterModel(),
                        };
                        let newBalance: number;
                        if (pointReservationActive) {
                            const settled = await pointAccountingService.finalizePresentation({
                                operationId,
                                userId,
                                presentationId,
                                chargedPoints: chargedTokens,
                                expectedRevision,
                                updates: finalUpdates,
                            });
                            newBalance = settled.balance;
                            reservationReleased = true;
                        } else {
                            const updated =
                                expectedRevision !== undefined
                                    ? await presentationRepo.updateOwnedAtRevision(
                                          presentationId,
                                          userId,
                                          expectedRevision,
                                          finalUpdates
                                      )
                                    : await presentationRepo.update(presentationId, finalUpdates);
                            if (!updated) throw new PresentationFinalizationConflictError();
                            newBalance = startingBalance;
                        }
                        finalized = true;

                        await stream.write(
                            sseFrame("saved", {
                                presentation_id: presentationId,
                                success: true,
                                slide_tokens_remaining: newBalance,
                                slide_tokens_charged: chargedTokens,
                            })
                        );

                        try {
                            await presentationService.storePresentationMemory({
                                presentationId,
                                userId,
                                prompt: topic,
                                slides: allSlides,
                                title: finalTitle,
                                theme,
                                operation: "generation",
                                detailLevel,
                                tonality,
                                sources,
                            });
                        } catch (error) {
                            logSafeError("presentation_memory_write_failed", error);
                        }

                        console.log(
                            `Saved presentation ${presentationId} with ${allSlides.length} slides`
                        );

                        if (ai) {
                            try {
                                await aiConnectionService.markUsed(userId, ai.provider);
                            } catch (error) {
                                logSafeError("ai_provider_usage_update_failed", error);
                            }
                        }
                    } else {
                        console.error(`No slides generated for presentation ${presentationId}`);
                        const message = "Failed to generate presentation content";
                        await saveFailure(message);
                        await stream.write(
                            sseFrame("error", {
                                error: message,
                                presentation_id: presentationId,
                            })
                        );
                    }
                } catch (error: unknown) {
                    if (cancellation.signal.aborted) {
                        if (!finalized) {
                            await saveFailure("Presentation generation was cancelled.");
                        }
                        return;
                    }
                    const message = error instanceof Error ? error.message : "Unknown error";
                    logSafeError("presentation_generation_failed", error);
                    if (!finalized) {
                        if (error instanceof PresentationFinalizationConflictError) {
                            await refundReservation();
                        } else {
                            await saveFailure(message);
                        }
                        try {
                            await stream.write(
                                sseFrame("error", {
                                    error: message,
                                    presentation_id: presentationId,
                                })
                            );
                        } catch (writeError) {
                            logSafeError("generation_error_event_write_failed", writeError);
                        }
                    } else {
                        logSafeError("generation_stream_disconnected", error);
                    }
                } finally {
                    clearInterval(keepAlive);
                    c.req.raw.signal.removeEventListener("abort", onRequestAbort);
                }
            });
        } catch (error: unknown) {
            return requestErrorResponse(c, error);
        }
    }
);

// Perform research prepass before generation
presentations.post(
    "/research-presentation",
    limitedBody(MAX_RESEARCH_BODY_BYTES),
    authMiddleware,
    researchRateLimit,
    ensureUserInDbMiddleware,
    async (c) => {
        try {
            const userId = getCurrentUserId(c);
            const body = await readJsonBody(c, MAX_RESEARCH_BODY_BYTES);
            const topic = parseRequiredText(
                aliasedField(body, "topic", "prompt", "query"),
                "topic"
            );
            const requestedSlideCount = parseSlideCount(
                aliasedField(body, "slide_count", "slideCount"),
                false
            );
            const detailLevel = parseKnownValue(
                aliasedField(body, "detail_level", "detailLevel"),
                "detail_level",
                DETAIL_LEVELS,
                "balanced"
            );
            const tonality = parseKnownValue(
                body["tonality"],
                "tonality",
                TONALITIES,
                "professional"
            );
            const research = parseResearchOptions(body["research"]);
            if (!research.enabled) inputError("research.enabled must be true");

            const generationMode = (await aiConnectionService.getConfiguration(userId)).generation
                .mode;
            const sources = await searchService.webSearch(topic, research, c.req.raw.signal);

            // Store search embedding for RAG context
            try {
                await searchService.storeSourceChunks(
                    userId,
                    topic,
                    sources,
                    undefined,
                    c.req.raw.signal
                );
            } catch (error) {
                logSafeError("research_source_chunk_write_failed", error);
            }

            const estimatedTokens =
                requestedSlideCount !== undefined
                    ? generationMode === "byok"
                        ? 0
                        : presentationService.calculateEstimatedTokens(
                              requestedSlideCount,
                              detailLevel,
                              tonality,
                              topic,
                              { sources }
                          )
                    : undefined;

            return c.json(
                {
                    sources,
                    ...(estimatedTokens === undefined ? {} : { estimated_tokens: estimatedTokens }),
                },
                200
            );
        } catch (error: unknown) {
            return requestErrorResponse(c, error);
        }
    }
);

// Iterate on an existing presentation with streaming
presentations.post(
    "/iterate-presentation-stream",
    limitedBody(MAX_ITERATION_BODY_BYTES),
    authMiddleware,
    iterationRateLimit,
    ensureUserInDbMiddleware,
    async (c) => {
        try {
            const userId = getCurrentUserId(c);
            const body = await readJsonBody(c, MAX_ITERATION_BODY_BYTES);

            const parentPresentationIdInput = aliasedField(
                body,
                "parent_presentation_id",
                "presentation_id",
                "parentPresentationId",
                "presentationId"
            );
            if (
                typeof parentPresentationIdInput !== "string" ||
                parentPresentationIdInput.trim().length === 0 ||
                parentPresentationIdInput.length > 200
            ) {
                inputError("presentation_id must be a non-empty string");
            }
            const presentationId = parentPresentationIdInput.trim();
            const feedback = parseRequiredText(
                aliasedField(body, "feedback", "topic", "prompt"),
                "feedback"
            );
            const iterationSlideCount = parseSlideCount(
                aliasedField(body, "slide_count", "slideCount"),
                false
            );
            const detailLevel = parseKnownValue(
                aliasedField(body, "detail_level", "detailLevel"),
                "detail_level",
                DETAIL_LEVELS,
                "balanced"
            );
            const tonality = parseKnownValue(
                body["tonality"],
                "tonality",
                TONALITIES,
                "professional"
            );
            const research =
                body["research"] === undefined ? undefined : parseResearchOptions(body["research"]);

            const iterationBase = await presentationService.getPresentation(presentationId, userId);

            const requestedAI = parseAISelection(body["ai"]);
            let ai: (AIModelSelection & { apiKey: string }) | undefined;
            try {
                ai = await aiConnectionService.resolveSelection(userId, requestedAI);
            } catch (error) {
                return byokError(c, error);
            }

            const storedSlides = (iterationBase.slidesData as Partial<PresentationJSON>)?.slides;
            const quotedSlideCount =
                iterationSlideCount !== undefined
                    ? iterationSlideCount
                    : Array.isArray(storedSlides) && storedSlides.length > 0
                      ? Math.min(storedSlides.length, 40)
                      : 5;
            const estimatedTokens = !ai
                ? presentationService.calculateEstimatedTokens(
                      quotedSlideCount,
                      detailLevel,
                      tonality
                  )
                : 0;
            const operationId = crypto.randomUUID();
            let pointReservationActive = false;
            let startingBalance: number;
            try {
                const reservation = await pointAccountingService.reserveExistingPresentation({
                    operationId,
                    userId,
                    presentationId,
                    kind: "iteration",
                    quotedPoints: estimatedTokens,
                });
                startingBalance = reservation.balance;
                pointReservationActive = true;
            } catch (error) {
                if (error instanceof InsufficientGenerationPointsError) {
                    return insufficientPointsError(c, error);
                }
                throw error;
            }

            const effectiveFeedback =
                iterationSlideCount !== undefined
                    ? `${feedback}\n\nTarget slide count: ${iterationSlideCount}.`
                    : feedback;

            c.header("Content-Type", "text/event-stream; charset=utf-8");
            c.header("Cache-Control", "no-cache, no-transform");
            c.header("X-Accel-Buffering", "no");
            return trackedStream(c, async (stream) => {
                const cancellation = new AbortController();
                const onRequestAbort = () => cancellation.abort(c.req.raw.signal.reason);
                if (c.req.raw.signal.aborted) onRequestAbort();
                else c.req.raw.signal.addEventListener("abort", onRequestAbort, { once: true });
                stream.onAbort(() =>
                    cancellation.abort(new DOMException("SSE closed", "AbortError"))
                );
                const keepAlive = setInterval(
                    () => {
                        void stream.write(": keepalive\n\n").catch(() => undefined);
                    },
                    positiveIntegerEnv("SSE_KEEPALIVE_INTERVAL_MS", 10000)
                );
                let finalized = false;
                let reservationReleased = !pointReservationActive;
                let lastLeaseRenewal = Date.now();

                const refundReservation = async () => {
                    if (reservationReleased) return;
                    await pointAccountingService.refund(operationId, userId);
                    reservationReleased = true;
                };

                try {
                    const allSlides: Slide[] = [];
                    let theme = "corporate-blue";
                    let title = "Updated Presentation";
                    let tokensUsed = 0;
                    let sources: Source[] | undefined;
                    let completedDocument: PresentationJSON | undefined;
                    let iterationCompleted = false;
                    let iterationFailed = false;

                    for await (const event of presentationService.iteratePresentationStream({
                        userId,
                        presentationId,
                        operationId,
                        feedback: effectiveFeedback,
                        detailLevel,
                        tonality,
                        research,
                        ai,
                        slideCount: iterationSlideCount,
                        signal: cancellation.signal,
                    })) {
                        if (Date.now() - lastLeaseRenewal >= 5 * 60 * 1000) {
                            await pointAccountingService.renew(operationId, userId);
                            lastLeaseRenewal = Date.now();
                        }
                        const eventType = event.event || "data";
                        // biome-ignore lint/suspicious/noExplicitAny: Data varies by event type
                        const eventData = (event as any).data || {};

                        if (eventType === "theme") {
                            theme = eventData.theme || theme;
                        }

                        if (eventType === "retry") {
                            allSlides.length = 0;
                            theme = "corporate-blue";
                            title = "Updated Presentation";
                            tokensUsed = 0;
                            sources = undefined;
                            completedDocument = undefined;
                            iterationCompleted = false;
                        }

                        if (eventType === "slide") {
                            const slide = eventData.slide;
                            if (slide) {
                                const index = Number(eventData.index);
                                if (Number.isInteger(index) && index >= 0) {
                                    allSlides[index] = slide;
                                } else {
                                    const existingIndex = allSlides.findIndex(
                                        (existing) => existing.id === slide.id
                                    );
                                    if (existingIndex >= 0) allSlides[existingIndex] = slide;
                                    else allSlides.push(slide);
                                }
                            }
                            if (eventData.title) {
                                title = eventData.title;
                            }
                        }

                        if (eventType === "complete") {
                            iterationCompleted = true;
                            completedDocument = eventData as PresentationJSON;
                            if (eventData.slides) {
                                allSlides.length = 0;
                                allSlides.push(...eventData.slides);
                            }
                            if (eventData.theme) {
                                theme = eventData.theme;
                            }
                            if (eventData.title) {
                                title = eventData.title;
                            }
                            if (Array.isArray(eventData.sources)) {
                                sources = eventData.sources;
                            }
                            tokensUsed = eventData.tokens_used || 0;
                        }

                        if (eventType === "error") {
                            iterationFailed = true;
                        }

                        await stream.write(sseFrame(eventType, eventData));
                    }

                    if (iterationFailed || !iterationCompleted) {
                        await refundReservation();
                        if (!iterationFailed) {
                            await stream.write(
                                sseFrame("error", {
                                    error: "Presentation update ended before completion. Please try again.",
                                })
                            );
                        }
                        return;
                    }

                    if (allSlides.length > 0) {
                        const finalTitle = (() => {
                            const trimmed = typeof title === "string" ? title.trim() : "";
                            return (trimmed || "Updated Presentation").slice(0, 255);
                        })();

                        const finalData: PresentationJSON = {
                            ...completedDocument,
                            schemaVersion: allSlides.every((slide) => slide.type === "scene")
                                ? SCENE_PRESENTATION_SCHEMA_VERSION
                                : PRESENTATION_SCHEMA_VERSION,
                            engineVersion: allSlides.every((slide) => slide.type === "scene")
                                ? SCENE_ENGINE_VERSION
                                : completedDocument?.["engineVersion"],
                            dimensions: completedDocument?.dimensions || {
                                width: 1280,
                                height: 720,
                            },
                            slides: allSlides,
                            theme,
                            title: finalTitle,
                            status: "ready",
                            totalSlides: allSlides.length,
                            tokens_used: tokensUsed,
                        };

                        if (sources?.length) {
                            finalData.sources = sources;
                        }

                        const chargedTokens = ai
                            ? 0
                            : presentationService.calculateActualTokenCost(
                                  tokensUsed,
                                  estimatedTokens
                              );
                        const finalUpdates = {
                            title: finalTitle,
                            slidesData: finalData,
                            aiProvider: ai?.provider || "openrouter",
                            aiModel: ai?.model || configuredOpenRouterModel(),
                        };
                        let newBalance: number;
                        if (pointReservationActive) {
                            const settled = await pointAccountingService.finalizePresentation({
                                operationId,
                                userId,
                                presentationId,
                                chargedPoints: chargedTokens,
                                expectedRevision: iterationBase.revision,
                                updates: finalUpdates,
                            });
                            newBalance = settled.balance;
                            reservationReleased = true;
                        } else {
                            const updated = await presentationRepo.updateOwnedAtRevision(
                                presentationId,
                                userId,
                                iterationBase.revision,
                                finalUpdates
                            );
                            if (!updated) throw new PresentationFinalizationConflictError();
                            newBalance = startingBalance;
                        }
                        finalized = true;

                        await stream.write(
                            sseFrame("saved", {
                                presentation_id: presentationId,
                                success: true,
                                slide_tokens_remaining: newBalance,
                                slide_tokens_charged: chargedTokens,
                            })
                        );

                        try {
                            await presentationService.storePresentationMemory({
                                presentationId,
                                userId,
                                prompt: effectiveFeedback,
                                slides: allSlides,
                                title: finalTitle,
                                theme,
                                operation: "iteration",
                                detailLevel,
                                tonality,
                                sources,
                            });
                        } catch (error) {
                            logSafeError("presentation_memory_write_failed", error);
                        }

                        if (ai) {
                            try {
                                await aiConnectionService.markUsed(userId, ai.provider);
                            } catch (error) {
                                logSafeError("ai_provider_usage_update_failed", error);
                            }
                        }
                    } else {
                        await refundReservation();
                        await stream.write(
                            sseFrame("error", {
                                error: "Failed to iterate presentation content",
                            })
                        );
                    }
                } catch (error: unknown) {
                    if (cancellation.signal.aborted) {
                        if (!finalized) await refundReservation();
                        return;
                    }
                    const message =
                        error instanceof PresentationFinalizationConflictError
                            ? "Presentation changed while the iteration was running. Review the latest edits and try again."
                            : error instanceof Error
                              ? error.message
                              : "Unknown error";
                    logSafeError("presentation_iteration_failed", error);
                    if (!finalized) {
                        await refundReservation();
                        try {
                            await stream.write(sseFrame("error", { error: message }));
                        } catch (writeError) {
                            logSafeError("iteration_error_event_write_failed", writeError);
                        }
                    } else {
                        logSafeError("iteration_stream_disconnected", error);
                    }
                } finally {
                    clearInterval(keepAlive);
                    c.req.raw.signal.removeEventListener("abort", onRequestAbort);
                }
            });
        } catch (error: unknown) {
            return requestErrorResponse(c, error);
        }
    }
);

// Get all presentations
presentations.get("/presentations", authMiddleware, async (c) => {
    try {
        const userId = getCurrentUserId(c);
        const limit = parsePaginationValue(c.req.query("limit"), "limit", 20, 1, 100);
        const offset = parsePaginationValue(
            c.req.query("offset"),
            "offset",
            0,
            0,
            Number.MAX_SAFE_INTEGER
        );

        const result = await presentationService.getUserPresentations(userId, limit, offset);

        const presentationsData: PresentationSummary[] = result.presentations.map((p) => {
            const slidesData = p.slidesData as PresentationJSON;
            const successfulSources = slidesData?.sources;
            const retrySources = slidesData?.failure?.retry.research_payload?.sources;
            return {
                id: p.id,
                title: p.title,
                prompt: p.prompt,
                slide_count: slidesData?.slides?.length || 0,
                status:
                    slidesData?.status === "failed"
                        ? "failed"
                        : slidesData?.status === "generating"
                          ? "generating"
                          : "ready",
                has_research: Boolean(
                    (slidesData?.status !== "failed" &&
                        Array.isArray(successfulSources) &&
                        successfulSources.length) ||
                        (slidesData?.status === "failed" &&
                            Array.isArray(retrySources) &&
                            retrySources.length)
                ),
                created_at: p.createdAt.toISOString(),
                updated_at: p.updatedAt.toISOString(),
            };
        });

        return c.json(
            {
                presentations: presentationsData,
                total: result.total,
                limit,
                offset,
                has_more: result.hasMore,
            },
            200
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return c.json({ error: { message } }, 400);
    }
});

// Get specific presentation
presentations.get("/presentations/:id", authMiddleware, async (c) => {
    try {
        const userId = getCurrentUserId(c);
        const presentationId = c.req.param("id");

        if (!presentationId) {
            return c.json({ error: { message: "Invalid presentation ID" } }, 400);
        }

        const presentation = await presentationService.getPresentation(presentationId, userId);

        return c.json(
            {
                presentation: {
                    id: presentation.id,
                    title: presentation.title,
                    prompt: presentation.prompt,
                    slides_data: normalizePresentationDocument(presentation.slidesData),
                    created_at: presentation.createdAt.toISOString(),
                    updated_at: presentation.updatedAt.toISOString(),
                },
            } satisfies PresentationResponse,
            200
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.includes("not found")) {
            return c.json({ error: { message } }, 404);
        }
        if (message.includes("Unauthorized")) {
            return c.json({ error: { message } }, 403);
        }
        return c.json({ error: { message } }, 400);
    }
});

// Apply persistent editor mutations to a presentation document.
presentations.patch(
    "/presentations/:id",
    limitedBody(MAX_MUTATION_BODY_BYTES),
    authMiddleware,
    async (c) => {
        try {
            const userId = getCurrentUserId(c);
            const presentationId = c.req.param("id");
            if (!presentationId) {
                return c.json({ error: { message: "Invalid presentation ID" } }, 400);
            }

            const request = parsePresentationMutationRequest(
                (await readJsonBody(
                    c,
                    MAX_MUTATION_BODY_BYTES
                )) as unknown as PresentationMutationRequest
            );
            const presentation = await presentationService.updatePresentation(
                presentationId,
                userId,
                request.mutations
            );
            return c.json(
                {
                    presentation: {
                        id: presentation.id,
                        title: presentation.title,
                        prompt: presentation.prompt,
                        slides_data: normalizePresentationDocument(presentation.slidesData),
                        created_at: presentation.createdAt.toISOString(),
                        updated_at: presentation.updatedAt.toISOString(),
                    },
                } satisfies PresentationResponse,
                200
            );
        } catch (error: unknown) {
            if (error instanceof RequestInputError) return requestErrorResponse(c, error);
            const message = error instanceof Error ? error.message : "Unknown error";
            if (message.includes("not found")) return c.json({ error: { message } }, 404);
            if (message.includes("Unauthorized")) return c.json({ error: { message } }, 403);
            if (message.includes("changed while")) return c.json({ error: { message } }, 409);
            return c.json({ error: { message } }, 400);
        }
    }
);

// Delete presentation
presentations.delete("/presentations/:id", authMiddleware, async (c) => {
    try {
        const userId = getCurrentUserId(c);
        const presentationId = c.req.param("id");

        if (!presentationId) {
            return c.json({ error: { message: "Invalid presentation ID" } }, 400);
        }

        await presentationService.deletePresentation(presentationId, userId);

        return c.body(null, 204);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.includes("not found")) {
            return c.json({ error: { message } }, 404);
        }
        if (message.includes("Unauthorized")) {
            return c.json({ error: { message } }, 403);
        }
        return c.json({ error: { message } }, 400);
    }
});

export default presentations;
