import { PresentationRepository, UserRepository } from "@slide-sage/database";
import type {
    PresentationJSON,
    PresentationResponse,
    PresentationSummary,
    PresentationsResponse,
    ResearchOptions,
    ResearchPayload,
    Slide,
    Source,
} from "@slide-sage/types";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { authMiddleware, ensureUserInDbMiddleware, getCurrentUserId } from "../services/auth";
import { PresentationService } from "../services/presentation.service";
import { SearchService } from "../services/search.service";

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

function parseResearchOptions(input: unknown): ResearchOptions | undefined {
    if (!input || typeof input !== "object") return undefined;

    const value = input as ResearchOptionsInput;
    const enabled = Boolean(value.enabled);
    if (!enabled) return { enabled: false };

    const freshnessRaw = value.freshness;
    const freshness =
        freshnessRaw === "day" ||
        freshnessRaw === "week" ||
        freshnessRaw === "month" ||
        freshnessRaw === "year"
            ? freshnessRaw
            : undefined;

    const maxResultsRaw = value.maxResults;
    const maxResults =
        typeof maxResultsRaw === "number" && Number.isFinite(maxResultsRaw)
            ? maxResultsRaw
            : undefined;

    const includeDomains = parseStringList(value.includeDomains);
    const excludeDomains = parseStringList(value.excludeDomains);
    const startPublishedDate =
        typeof value.startPublishedDate === "string" ? value.startPublishedDate : undefined;
    const endPublishedDate =
        typeof value.endPublishedDate === "string" ? value.endPublishedDate : undefined;
    const maxAgeHoursRaw = value.maxAgeHours;
    const maxAgeHours =
        typeof maxAgeHoursRaw === "number" && Number.isFinite(maxAgeHoursRaw)
            ? maxAgeHoursRaw
            : undefined;

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

function parseStringList(input: unknown): string[] | undefined {
    if (!Array.isArray(input)) return undefined;

    const values = input
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);

    return values.length ? values : undefined;
}

function parseResearchPayload(input: unknown): ResearchPayload | undefined {
    if (!input || typeof input !== "object") return undefined;

    const value = input as ResearchPayloadInput;
    const sourcesRaw = value.sources;
    if (!Array.isArray(sourcesRaw)) return undefined;

    const sources: Source[] = [];
    for (const source of sourcesRaw) {
        if (!source || typeof source !== "object") continue;
        const src = source as ResearchSourceInput;
        const url = typeof src.url === "string" ? src.url.trim() : "";
        if (!url) continue;
        sources.push({
            url,
            title: typeof src.title === "string" ? src.title : undefined,
            snippet: typeof src.snippet === "string" ? src.snippet : undefined,
            retrieved_at: typeof src.retrieved_at === "string" ? src.retrieved_at : undefined,
            published_date:
                typeof src.published_date === "string"
                    ? src.published_date
                    : typeof src.publishedDate === "string"
                      ? src.publishedDate
                      : undefined,
            author: typeof src.author === "string" ? src.author : undefined,
            highlights: parseStringList(src.highlights),
            summary: typeof src.summary === "string" ? src.summary : undefined,
        });
    }

    const estimatedTokens = value.estimated_tokens;
    return {
        sources,
        ...(typeof estimatedTokens === "number" && Number.isFinite(estimatedTokens)
            ? { estimated_tokens: estimatedTokens }
            : {}),
    };
}

function positiveIntegerEnv(name: string, fallback: number): number {
    const parsed = Number.parseInt(process.env[name] || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sseFrame(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const presentations = new Hono();
const presentationService = new PresentationService();
const presentationRepo = new PresentationRepository();
const searchService = new SearchService();

interface FailedPresentationInput {
    presentationId: string;
    topic: unknown;
    slideCount: unknown;
    detailLevel: string;
    tonality: string;
    researchEnabled: boolean;
    researchPayload?: ResearchPayload;
    sources?: Source[];
    estimatedTokens: number;
    message: string;
}

async function markPresentationFailed({
    presentationId,
    topic,
    slideCount,
    detailLevel,
    tonality,
    researchEnabled,
    researchPayload,
    sources,
    estimatedTokens,
    message,
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
        title: failedTitle,
        theme: "corporate-blue",
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
        await presentationRepo.update(presentationId, {
            title: failedTitle,
            slidesData: failedData,
        });
    } catch (error) {
        console.error(`Failed to save retry data for presentation ${presentationId}:`, error);
    }
}

// Generate presentation with streaming
presentations.post(
    "/generate-presentation-stream",
    authMiddleware,
    ensureUserInDbMiddleware,
    async (c) => {
        try {
            const userId = getCurrentUserId(c);
            const body = await c.req.json();

            const { topic, slide_count, detail_level, tonality } = body;
            const research = parseResearchOptions(body?.research);
            const researchPayload = parseResearchPayload(
                body?.research_payload ?? body?.researchPayload
            );

            if (!topic || !slide_count) {
                return c.json({ error: { message: "Missing required fields" } }, 400);
            }

            // Verify the user has enough points BEFORE we create anything or start streaming.
            // The frontend expects a 402 with { slide_tokens_remaining, slide_tokens_required }.
            const estimatedTokens = presentationService.calculateEstimatedTokens(
                slide_count,
                detail_level || "balanced",
                tonality || "professional",
                String(topic),
                researchPayload
            );
            const { sufficient, user, shortfall } = await UserRepository.hasSufficientTokens(
                userId,
                estimatedTokens
            );
            if (!sufficient) {
                return c.json(
                    {
                        error: { message: "Insufficient points", code: "INSUFFICIENT_TOKENS" },
                        slide_tokens_remaining: user.slideTokens,
                        slide_tokens_required: estimatedTokens,
                        slide_tokens_shortfall: shortfall ?? estimatedTokens,
                    },
                    402
                );
            }

            // Create initial presentation record
            const presentation = await presentationRepo.create(userId, "Generating...", topic, {
                slides: [],
                theme: "corporate-blue",
                title: "Generating...",
            });

            const presentationId = presentation.id;

            c.header("Content-Type", "text/event-stream; charset=utf-8");
            c.header("Cache-Control", "no-cache, no-transform");
            c.header("X-Accel-Buffering", "no");
            return stream(c, async (stream) => {
                await stream.write(sseFrame("created", { presentation_id: presentationId }));
                const keepAlive = setInterval(
                    () => {
                        void stream.write(": keepalive\n\n").catch(() => undefined);
                    },
                    positiveIntegerEnv("SSE_KEEPALIVE_INTERVAL_MS", 10000)
                );
                let retainedSources: Source[] | undefined = researchPayload?.sources;

                try {
                    const allSlides: Slide[] = [];
                    let theme = "corporate-blue";
                    let title = "Untitled Presentation";
                    let sources: Source[] | undefined = retainedSources;
                    let tokensUsed = 0;
                    let generationCompleted = false;
                    let generationFailed = false;
                    let failureSaved = false;
                    let failureMessage = "Presentation generation failed. Please try again.";

                    const saveFailure = async (message: string) => {
                        if (failureSaved) return;
                        failureSaved = true;
                        failureMessage = message;
                        await markPresentationFailed({
                            presentationId,
                            topic,
                            slideCount: slide_count,
                            detailLevel: detail_level || "balanced",
                            tonality: tonality || "professional",
                            researchEnabled: Boolean(research?.enabled || sources?.length),
                            researchPayload,
                            sources,
                            estimatedTokens,
                            message,
                        });
                    };

                    // Stream presentation generation
                    for await (const event of presentationService.generatePresentationStream({
                        userId,
                        operationId: presentationId,
                        topic,
                        slideCount: slide_count,
                        detailLevel: detail_level || "balanced",
                        tonality: tonality || "professional",
                        research,
                        researchPayload,
                    })) {
                        const eventType = event.event || "data";
                        // biome-ignore lint/suspicious/noExplicitAny: Data varies by event type
                        const eventData = (event as any).data || {};

                        // Accumulate data
                        if (eventType === "theme") {
                            theme = eventData.theme || theme;
                        }

                        if (eventType === "retry") {
                            allSlides.length = 0;
                            theme = "corporate-blue";
                            title = "Untitled Presentation";
                            tokensUsed = 0;
                            generationCompleted = false;
                        }

                        if (eventType === "research" && Array.isArray(eventData.sources)) {
                            sources = eventData.sources;
                            retainedSources = eventData.sources;
                        }

                        if (eventType === "slide") {
                            const slide = eventData.slide;
                            if (slide) {
                                allSlides.push(slide);
                            }
                            if (eventData.title) {
                                title = eventData.title;
                            }
                        }

                        if (eventType === "complete") {
                            generationCompleted = true;
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
                                retainedSources = eventData.sources;
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

                        // Update the existing presentation with final data
                        await presentationRepo.update(presentationId, {
                            title: finalTitle,
                            slidesData: finalData,
                        });

                        // Store semantic memory for retrieval during future iterations.
                        try {
                            await presentationService.storePresentationMemory({
                                presentationId,
                                userId,
                                prompt: topic,
                                slides: allSlides,
                                title: finalTitle,
                                theme,
                                operation: "generation",
                                detailLevel: detail_level || "balanced",
                                tonality: tonality || "professional",
                                sources,
                            });
                        } catch (error) {
                            console.warn("Failed to store presentation semantic memory:", error);
                        }

                        console.log(
                            `Saved presentation ${presentationId} with ${allSlides.length} slides`
                        );

                        // Deduct the SAME slide-based estimate we checked against up front and that
                        // the purchase page advertises, so the price charged matches the price
                        // quoted everywhere (no surprise AI-token-based amount).
                        let newBalance: number | null = null;
                        try {
                            const updatedUser = await UserRepository.deductTokens(
                                userId,
                                estimatedTokens
                            );
                            newBalance = updatedUser.slideTokens;
                        } catch (deductError) {
                            console.error(
                                "Failed to deduct points:",
                                deductError instanceof Error
                                    ? deductError.message
                                    : String(deductError)
                            );
                        }

                        await stream.write(
                            sseFrame("saved", {
                                presentation_id: presentationId,
                                success: true,
                                slide_tokens_remaining: newBalance,
                            })
                        );
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
                    const message = error instanceof Error ? error.message : "Unknown error";
                    console.error("Error during generation:", error);
                    await markPresentationFailed({
                        presentationId,
                        topic,
                        slideCount: slide_count,
                        detailLevel: detail_level || "balanced",
                        tonality: tonality || "professional",
                        researchEnabled: Boolean(research?.enabled || retainedSources?.length),
                        researchPayload,
                        sources: retainedSources,
                        estimatedTokens,
                        message,
                    });
                    await stream.write(
                        sseFrame("error", { error: message, presentation_id: presentationId })
                    );
                } finally {
                    clearInterval(keepAlive);
                }
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return c.json({ error: { message } }, 400);
        }
    }
);

// Perform research prepass before generation
presentations.post(
    "/research-presentation",
    authMiddleware,
    ensureUserInDbMiddleware,
    async (c) => {
        try {
            const userId = getCurrentUserId(c);
            const body = await c.req.json();
            const topic = body?.topic ?? body?.prompt ?? body?.query;
            const research = parseResearchOptions(body?.research);

            if (!topic || !research?.enabled) {
                return c.json({ error: { message: "Missing required fields" } }, 400);
            }

            const sources = await searchService.webSearch(String(topic), research);

            // Store search embedding for RAG context
            try {
                await searchService.storeSourceChunks(userId, String(topic), sources);
            } catch (error) {
                console.warn("Failed to store source chunks:", error);
            }

            const requestedSlideCount = Number(body?.slide_count ?? body?.slideCount);
            const estimatedTokens =
                Number.isFinite(requestedSlideCount) && requestedSlideCount > 0
                    ? presentationService.calculateEstimatedTokens(
                          requestedSlideCount,
                          body?.detail_level ?? body?.detailLevel ?? "balanced",
                          body?.tonality ?? "professional",
                          String(topic),
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
            const message = error instanceof Error ? error.message : "Unknown error";
            return c.json({ error: { message } }, 400);
        }
    }
);

// Iterate on an existing presentation with streaming
presentations.post(
    "/iterate-presentation-stream",
    authMiddleware,
    ensureUserInDbMiddleware,
    async (c) => {
        try {
            const userId = getCurrentUserId(c);
            const body = await c.req.json();

            const parentPresentationId =
                body?.parent_presentation_id ??
                body?.presentation_id ??
                body?.parentPresentationId ??
                body?.presentationId;
            const feedback = body?.feedback ?? body?.topic ?? body?.prompt;
            const slideCount = body?.slide_count ?? body?.slideCount;
            const detailLevel = body?.detail_level ?? body?.detailLevel;
            const tonality = body?.tonality;
            const research = parseResearchOptions(body?.research);

            if (!parentPresentationId || !feedback) {
                return c.json({ error: { message: "Missing required fields" } }, 400);
            }

            const presentationId = String(parentPresentationId);

            // Verify the user has enough points before iterating (mirrors generation).
            const iterationSlideCount = Number(slideCount);
            const estimatedTokens = presentationService.calculateEstimatedTokens(
                Number.isFinite(iterationSlideCount) && iterationSlideCount > 0
                    ? iterationSlideCount
                    : 5,
                detailLevel || "balanced",
                tonality || "professional"
            );
            const { sufficient, user, shortfall } = await UserRepository.hasSufficientTokens(
                userId,
                estimatedTokens
            );
            if (!sufficient) {
                return c.json(
                    {
                        error: { message: "Insufficient points", code: "INSUFFICIENT_TOKENS" },
                        slide_tokens_remaining: user.slideTokens,
                        slide_tokens_required: estimatedTokens,
                        slide_tokens_shortfall: shortfall ?? estimatedTokens,
                    },
                    402
                );
            }

            const effectiveFeedback = (() => {
                const count = Number(slideCount);
                if (Number.isFinite(count) && count > 0) {
                    return `${String(feedback)}\n\nTarget slide count: ${count}.`;
                }
                return String(feedback);
            })();

            c.header("Content-Type", "text/event-stream; charset=utf-8");
            c.header("Cache-Control", "no-cache, no-transform");
            c.header("X-Accel-Buffering", "no");
            return stream(c, async (stream) => {
                const keepAlive = setInterval(
                    () => {
                        void stream.write(": keepalive\n\n").catch(() => undefined);
                    },
                    positiveIntegerEnv("SSE_KEEPALIVE_INTERVAL_MS", 10000)
                );

                try {
                    const allSlides: Slide[] = [];
                    let theme = "corporate-blue";
                    let title = "Updated Presentation";
                    let tokensUsed = 0;
                    let sources: Source[] | undefined;
                    let iterationCompleted = false;
                    let iterationFailed = false;

                    for await (const event of presentationService.iteratePresentationStream({
                        userId,
                        presentationId,
                        operationId: crypto.randomUUID(),
                        feedback: effectiveFeedback,
                        detailLevel: detailLevel || "balanced",
                        tonality: tonality || "professional",
                        research,
                    })) {
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
                            iterationCompleted = false;
                        }

                        if (eventType === "slide") {
                            const slide = eventData.slide;
                            if (slide) {
                                allSlides.push(slide);
                            }
                            if (eventData.title) {
                                title = eventData.title;
                            }
                        }

                        if (eventType === "complete") {
                            iterationCompleted = true;
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
                            slides: allSlides,
                            theme,
                            title: finalTitle,
                            totalSlides: allSlides.length,
                            tokens_used: tokensUsed,
                        };

                        if (sources?.length) {
                            finalData.sources = sources;
                        }

                        await presentationRepo.update(presentationId, {
                            title: finalTitle,
                            slidesData: finalData,
                        });

                        // Store semantic memory for future RAG context.
                        try {
                            await presentationService.storePresentationMemory({
                                presentationId,
                                userId,
                                prompt: effectiveFeedback,
                                slides: allSlides,
                                title: finalTitle,
                                theme,
                                operation: "iteration",
                                detailLevel: detailLevel || "balanced",
                                tonality: tonality || "professional",
                                sources,
                            });
                        } catch (error) {
                            console.warn("Failed to store presentation semantic memory:", error);
                        }

                        // Deduct the same slide-based estimate we checked against (consistent
                        // with generation and the advertised pricing).
                        let newBalance: number | null = null;
                        try {
                            const updatedUser = await UserRepository.deductTokens(
                                userId,
                                estimatedTokens
                            );
                            newBalance = updatedUser.slideTokens;
                        } catch (deductError) {
                            console.error(
                                "Failed to deduct points:",
                                deductError instanceof Error
                                    ? deductError.message
                                    : String(deductError)
                            );
                        }

                        await stream.write(
                            sseFrame("saved", {
                                presentation_id: presentationId,
                                success: true,
                                slide_tokens_remaining: newBalance,
                            })
                        );
                    } else {
                        await stream.write(
                            sseFrame("error", {
                                error: "Failed to iterate presentation content",
                            })
                        );
                    }
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : "Unknown error";
                    console.error("Error during iteration:", error);
                    await stream.write(sseFrame("error", { error: message }));
                } finally {
                    clearInterval(keepAlive);
                }
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return c.json({ error: { message } }, 400);
        }
    }
);

// Get all presentations
presentations.get("/presentations", authMiddleware, async (c) => {
    try {
        const userId = getCurrentUserId(c);

        const result = await presentationService.getUserPresentations(userId);

        const presentationsData: PresentationSummary[] = result.presentations.map((p) => {
            const slidesData = p.slidesData as PresentationJSON;
            return {
                id: p.id,
                title: p.title,
                prompt: p.prompt,
                slide_count: slidesData?.slides?.length || 0,
                status: slidesData?.status === "failed" ? "failed" : "ready",
                has_research: Boolean(slidesData?.failure?.retry.research_payload?.sources.length),
                created_at: p.createdAt.toISOString(),
                updated_at: p.updatedAt.toISOString(),
            };
        });

        return c.json({ presentations: presentationsData } satisfies PresentationsResponse, 200);
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
                    slides_data: presentation.slidesData as PresentationJSON,
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

// Delete presentation
presentations.delete("/presentations/:id", authMiddleware, async (c) => {
    try {
        const userId = getCurrentUserId(c);
        const presentationId = c.req.param("id");

        if (!presentationId) {
            return c.json({ error: { message: "Invalid presentation ID" } }, 400);
        }

        await presentationService.deletePresentation(presentationId, userId);

        return c.json({ message: "Presentation deleted successfully" }, 200);
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
