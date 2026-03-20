import type {
    PresentationJSON,
    ResearchOptions,
    ResearchPayload,
    Slide,
    Source,
} from "@slide-sage/contracts";
import { PresentationRepository } from "@slide-sage/db";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import {
    authMiddleware,
    ensureUserInDbMiddleware,
    getCurrentUserId,
} from "../middleware/auth.middleware";
import { PresentationService } from "../services/presentation.service";
import { SearchService } from "../services/search.service";

function parseResearchOptions(input: unknown): ResearchOptions | undefined {
    if (!input || typeof input !== "object") return undefined;

    const value = input as Record<string, unknown>;
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

    return {
        enabled: true,
        provider: "brave",
        freshness,
        maxResults,
    };
}

function parseResearchPayload(input: unknown): ResearchPayload | undefined {
    if (!input || typeof input !== "object") return undefined;

    const value = input as Record<string, unknown>;
    const sourcesRaw = value.sources;
    if (!Array.isArray(sourcesRaw)) return undefined;

    const sources: Source[] = [];
    for (const source of sourcesRaw) {
        if (!source || typeof source !== "object") continue;
        const src = source as Record<string, unknown>;
        const url = typeof src.url === "string" ? src.url.trim() : "";
        if (!url) continue;
        sources.push({
            url,
            title: typeof src.title === "string" ? src.title : undefined,
            snippet: typeof src.snippet === "string" ? src.snippet : undefined,
            retrieved_at: typeof src.retrieved_at === "string" ? src.retrieved_at : undefined,
        });
    }

    const summaryRaw = value.summary;
    const summary = typeof summaryRaw === "string" ? summaryRaw : null;

    return {
        summary,
        sources,
    };
}

const presentations = new Hono();
const presentationService = new PresentationService();
const presentationRepo = new PresentationRepository();
const searchService = new SearchService();

// Generate presentation with streaming
presentations.post("/generate-presentation-stream", authMiddleware, async (c) => {
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

        // Create initial presentation record
        const presentation = await presentationRepo.create(userId, "Generating...", topic, {
            slides: [],
            theme: "default",
            title: "Generating...",
        });

        const presentationId = presentation.id;

        return stream(c, async (stream) => {
            // Send presentation ID immediately
            await stream.write("event: created\n");
            await stream.write(`data: ${JSON.stringify({ presentation_id: presentationId })}\n\n`);

            try {
                const allSlides: Slide[] = [];
                let theme = "default";
                let title = "Untitled Presentation";
                let sources: Source[] | undefined;
                let tokensUsed = 0;

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

                    // Stream event to frontend
                    await stream.write(`event: ${eventType}\n`);
                    await stream.write(`data: ${JSON.stringify(eventData)}\n\n`);
                }

                // Save final presentation data
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

                    // Store initial topic/prompt with RAG embedding
                    try {
                        await presentationService.storeIterationWithEmbedding(
                            presentationId,
                            userId,
                            topic,
                            allSlides
                        );
                    } catch (error) {
                        console.warn("Failed to store initial topic embedding:", error);
                    }

                    console.log(
                        `Saved presentation ${presentationId} with ${allSlides.length} slides`
                    );

                    await stream.write("event: saved\n");
                    await stream.write(
                        `data: ${JSON.stringify({
                            presentation_id: presentationId,
                            success: true,
                        })}\n\n`
                    );
                } else {
                    console.error(`No slides generated for presentation ${presentationId}`);
                    await presentationService.deletePresentation(presentationId, userId);
                    await stream.write("event: error\n");
                    await stream.write(
                        `data: ${JSON.stringify({ error: "Failed to generate presentation content" })}\n\n`
                    );
                }
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "Unknown error";
                console.error("Error during generation:", error);
                await presentationService.deletePresentation(presentationId, userId);
                await stream.write("event: error\n");
                await stream.write(`data: ${JSON.stringify({ error: message })}\n\n`);
            }
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return c.json({ error: { message } }, 400);
    }
});

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
                await searchService.storeSearchWithEmbedding(userId, String(topic));
            } catch (error) {
                console.warn("Failed to store search embedding:", error);
            }

            const summaryResult = sources.length
                ? await searchService.summarizeSourcesDetailed(String(topic), sources)
                : { summary: null, tokensUsed: 0, tokensEstimated: 0 };

            return c.json(
                {
                    summary: summaryResult.summary,
                    sources,
                    tokens_used: summaryResult.tokensUsed,
                    tokens_estimated: summaryResult.tokensEstimated,
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
            const effectiveFeedback = (() => {
                const count = Number(slideCount);
                if (Number.isFinite(count) && count > 0) {
                    return `${String(feedback)}\n\nTarget slide count: ${count}.`;
                }
                return String(feedback);
            })();

            return stream(c, async (stream) => {
                try {
                    const allSlides: Slide[] = [];
                    let theme = "default";
                    let title = "Updated Presentation";
                    let tokensUsed = 0;
                    let sources: Source[] | undefined;

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

                        await stream.write(`event: ${eventType}\n`);
                        await stream.write(`data: ${JSON.stringify(eventData)}\n\n`);
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

                        // Store iteration embedding for RAG context
                        try {
                            await presentationService.storeIterationWithEmbedding(
                                presentationId,
                                userId,
                                effectiveFeedback,
                                allSlides
                            );
                        } catch (error) {
                            console.warn("Failed to store iteration embedding:", error);
                        }

                        await stream.write("event: saved\n");
                        await stream.write(
                            `data: ${JSON.stringify({
                                presentation_id: presentationId,
                                success: true,
                            })}\n\n`
                        );
                    } else {
                        await stream.write("event: error\n");
                        await stream.write(
                            `data: ${JSON.stringify({ error: "Failed to iterate presentation content" })}\n\n`
                        );
                    }
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : "Unknown error";
                    console.error("Error during iteration:", error);
                    await stream.write("event: error\n");
                    await stream.write(`data: ${JSON.stringify({ error: message })}\n\n`);
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

        const presentationsData = result.presentations.map((p) => {
            const slidesData = p.slidesData as PresentationJSON;
            return {
                id: p.id,
                title: p.title,
                slide_count: slidesData?.slides?.length || 0,
                created_at: p.createdAt,
                updated_at: p.updatedAt,
            };
        });

        return c.json({ presentations: presentationsData }, 200);
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
                    slides_data: presentation.slidesData,
                    created_at: presentation.createdAt,
                    updated_at: presentation.updatedAt,
                },
            },
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
