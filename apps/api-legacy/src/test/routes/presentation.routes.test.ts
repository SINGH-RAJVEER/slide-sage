import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const currentUserId = "user_1";
const presentationUpdates: Array<{ id: string; updates: Record<string, unknown> }> = [];
let failSavedWrite = false;

mock.module("../../middleware/rate-limit", () => ({
    userRateLimit: () => async (_c: unknown, next: () => Promise<void>) => await next(),
}));

mock.module("hono/streaming", () => ({
    stream: (
        c: { body: (body: ReadableStream<Uint8Array>) => Response },
        callback: (stream: {
            write: (chunk: string) => Promise<void>;
            onAbort: (listener: () => void | Promise<void>) => void;
        }) => Promise<void>
    ) => {
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
            async start(controller) {
                try {
                    await callback({
                        write: async (chunk: string) => {
                            if (failSavedWrite && chunk.startsWith("event: saved")) {
                                throw new Error("Client disconnected");
                            }
                            controller.enqueue(encoder.encode(chunk));
                        },
                        onAbort: () => undefined,
                    });
                    controller.close();
                } catch (error) {
                    controller.error(error);
                }
            },
        });
        return c.body(body);
    },
}));

class InsufficientGenerationPointsError extends Error {
    balance: number;
    required: number;
    shortfall: number;

    constructor(balance: number, required: number) {
        super("Insufficient points");
        this.balance = balance;
        this.required = required;
        this.shortfall = required - balance;
    }
}

class PresentationFinalizationConflictError extends Error {}

const userRepository = {
    deductTokens: mock(),
    hasSufficientTokens: mock(),
};

const presentationRepository = {
    create: mock(),
    update: mock(),
    updateOwnedAtRevision: mock(),
};

const presentationService = {
    calculateActualTokenCost: mock(),
    calculateEstimatedTokens: mock(),
    deletePresentation: mock(),
    generatePresentationStream: mock(),
    getPresentation: mock(),
    getUserPresentations: mock(),
    iteratePresentationStream: mock(),
    storePresentationMemory: mock(),
    updatePresentation: mock(),
};

const searchService = {
    storeSourceChunks: mock(),
    webSearch: mock(),
};

const aiConnectionService = {
    getConfiguration: mock(),
    resolveSelection: mock(),
    markUsed: mock(),
};

const pointAccountingService = {
    finalizePresentation: mock(),
    getBalance: mock(),
    refund: mock(),
    reserveExistingPresentation: mock(),
    reserveNewPresentation: mock(),
};

mock.module("../../services/ai-connections.service", () => ({
    AIConnectionService: class {
        getConfiguration = aiConnectionService.getConfiguration;
        resolveSelection = aiConnectionService.resolveSelection;
        markUsed = aiConnectionService.markUsed;
    },
}));

mock.module("../../services/auth", () => ({
    authMiddleware: async (
        c: { set: (key: string, value: string) => void },
        next: () => Promise<void>
    ) => {
        c.set("userId", currentUserId);
        await next();
    },
    ensureUserInDbMiddleware: async (_c: unknown, next: () => Promise<void>) => {
        await next();
    },
    getCurrentUserId: () => currentUserId,
}));

mock.module("../../services/generation-point-accounting.service", () => ({
    GenerationPointAccountingService: class {
        finalizePresentation = pointAccountingService.finalizePresentation;
        getBalance = pointAccountingService.getBalance;
        refund = pointAccountingService.refund;
        reserveExistingPresentation = pointAccountingService.reserveExistingPresentation;
        reserveNewPresentation = pointAccountingService.reserveNewPresentation;
    },
    InsufficientGenerationPointsError,
    PresentationFinalizationConflictError,
}));

mock.module("@/database", () => ({
    UserRepository: userRepository,
    AIConnectionRepository: class {},
    PresentationRepository: class {
        create = presentationRepository.create;
        update = (id: string, updates: Record<string, unknown>) => {
            presentationUpdates.push({ id, updates });
            return presentationRepository.update(id, updates);
        };
        updateOwnedAtRevision = (
            id: string,
            _userId: string,
            _updatedAt: Date,
            updates: Record<string, unknown>
        ) => {
            presentationUpdates.push({ id, updates });
            return presentationRepository.updateOwnedAtRevision(id, updates);
        };
    },
}));

mock.module("../../services/presentation.service", () => ({
    PresentationService: class {
        calculateActualTokenCost = presentationService.calculateActualTokenCost;
        calculateEstimatedTokens = presentationService.calculateEstimatedTokens;
        deletePresentation = presentationService.deletePresentation;
        generatePresentationStream = presentationService.generatePresentationStream;
        getPresentation = presentationService.getPresentation;
        getUserPresentations = presentationService.getUserPresentations;
        iteratePresentationStream = presentationService.iteratePresentationStream;
        storePresentationMemory = presentationService.storePresentationMemory;
        updatePresentation = presentationService.updatePresentation;
    },
}));

mock.module("../../services/search.service", () => ({
    SearchService: class {
        storeSourceChunks = searchService.storeSourceChunks;
        webSearch = searchService.webSearch;
    },
}));

const presentationRoutes = (await import("../../routes/presentation.routes")).default;

function app() {
    const hono = new Hono();
    hono.route("/api", presentationRoutes);
    return hono;
}

async function json(response: Response) {
    return await response.json();
}

async function text(response: Response) {
    return await response.text();
}

async function* successfulStream() {
    yield { event: "theme", data: { theme: "modern" } };
    yield {
        event: "complete",
        data: {
            title: "Quarterly Plan",
            theme: "modern",
            tokens_used: 100,
            slides: [{ id: "slide_1", type: "content", title: "Intro", content: "Hello" }],
            sources: [{ url: "https://example.com", title: "Example" }],
            dimensions: { width: 1600, height: 900 },
            outline: {
                title: "Quarterly Plan",
                audience: "Leadership",
                thesis: "Focus the quarter on execution.",
                cards: [],
            },
        },
    };
}

describe("presentation routes", () => {
    beforeEach(() => {
        failSavedWrite = false;
        presentationUpdates.length = 0;
        userRepository.deductTokens.mockReset();
        userRepository.hasSufficientTokens.mockReset();
        presentationRepository.create.mockReset();
        presentationRepository.update.mockReset();
        presentationRepository.updateOwnedAtRevision.mockReset();
        presentationService.calculateEstimatedTokens.mockReset();
        presentationService.calculateActualTokenCost.mockReset();
        presentationService.deletePresentation.mockReset();
        presentationService.generatePresentationStream.mockReset();
        presentationService.getPresentation.mockReset();
        presentationService.getUserPresentations.mockReset();
        presentationService.iteratePresentationStream.mockReset();
        presentationService.storePresentationMemory.mockReset();
        searchService.storeSourceChunks.mockReset();
        searchService.webSearch.mockReset();
        aiConnectionService.getConfiguration.mockReset();
        aiConnectionService.resolveSelection.mockReset();
        aiConnectionService.markUsed.mockReset();
        pointAccountingService.finalizePresentation.mockReset();
        pointAccountingService.getBalance.mockReset();
        pointAccountingService.refund.mockReset();
        pointAccountingService.reserveExistingPresentation.mockReset();
        pointAccountingService.reserveNewPresentation.mockReset();

        presentationService.calculateEstimatedTokens.mockReturnValue(3);
        presentationService.calculateActualTokenCost.mockImplementation(
            (tokensUsed: number, quote: number) =>
                tokensUsed > 0 ? Math.min(quote, tokensUsed / 1000) : quote
        );
        userRepository.hasSufficientTokens.mockResolvedValue({
            sufficient: true,
            user: { slideTokens: 20 },
            shortfall: 0,
        });
        userRepository.deductTokens.mockResolvedValue({ slideTokens: 17 });
        presentationRepository.create.mockResolvedValue({ id: "presentation_1" });
        presentationRepository.update.mockResolvedValue({});
        presentationRepository.updateOwnedAtRevision.mockResolvedValue({});
        pointAccountingService.getBalance.mockResolvedValue(20);
        pointAccountingService.reserveNewPresentation.mockResolvedValue({
            presentation: { id: "presentation_1" },
            balance: 17,
        });
        pointAccountingService.reserveExistingPresentation.mockResolvedValue({ balance: 17 });
        pointAccountingService.finalizePresentation.mockImplementation(
            async ({
                presentationId,
                updates,
            }: {
                presentationId: string;
                updates: Record<string, unknown>;
            }) => {
                presentationUpdates.push({ id: presentationId, updates });
                return { presentation: { id: presentationId }, balance: 19.9 };
            }
        );
        pointAccountingService.refund.mockResolvedValue(20);
        presentationService.getPresentation.mockResolvedValue({
            id: "presentation_1",
            userId: currentUserId,
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            slidesData: {
                schemaVersion: 5,
                title: "Existing deck",
                theme: "corporate-blue",
                slides: [{ id: "slide_1" }, { id: "slide_2" }],
                totalSlides: 2,
            },
        });
        presentationService.generatePresentationStream.mockImplementation(successfulStream);
        presentationService.iteratePresentationStream.mockImplementation(successfulStream);
        presentationService.storePresentationMemory.mockResolvedValue(undefined);
        aiConnectionService.resolveSelection.mockResolvedValue({
            provider: "openai",
            model: "gpt-4.1",
            apiKey: "secret",
        });
        aiConnectionService.getConfiguration.mockResolvedValue({
            generation: { mode: "openrouter" },
        });
        aiConnectionService.markUsed.mockResolvedValue(undefined);
    });

    it("validates generation requests and insufficient points", async () => {
        const missing = await app().request("/api/generate-presentation-stream", {
            method: "POST",
            body: JSON.stringify({ topic: "AI" }),
        });

        aiConnectionService.resolveSelection.mockResolvedValueOnce(undefined);
        pointAccountingService.reserveNewPresentation.mockRejectedValueOnce(
            new InsufficientGenerationPointsError(1, 3)
        );
        const insufficient = await app().request("/api/generate-presentation-stream", {
            method: "POST",
            body: JSON.stringify({ topic: "AI", slide_count: 3 }),
        });

        expect(missing.status).toBe(400);
        expect(await json(missing)).toEqual({
            error: { message: "slide_count must be an integer between 1 and 40" },
        });
        expect(insufficient.status).toBe(402);
        expect(await json(insufficient)).toEqual({
            error: { message: "Insufficient points", code: "INSUFFICIENT_TOKENS" },
            slide_tokens_remaining: 1,
            slide_tokens_required: 3,
            slide_tokens_shortfall: 2,
        });
    });

    it("rejects malformed generation input before any side effects", async () => {
        const invalidBodies = [
            { topic: " ", slide_count: 3 },
            { topic: "x".repeat(401), slide_count: 3 },
            { topic: "AI", slide_count: "3" },
            { topic: "AI", slide_count: 0 },
            { topic: "AI", slide_count: 41 },
            { topic: "AI", slide_count: 3, detail_level: null },
            { topic: "AI", slide_count: 3, detail_level: "verbose" },
            { topic: "AI", slide_count: 3, tonality: "urgent" },
            { topic: "AI", slide_count: 3, research: { enabled: "true" } },
            { topic: "AI", slide_count: 3, research: { enabled: true, maxResults: 9 } },
            {
                topic: "AI",
                slide_count: 3,
                research_payload: null,
            },
            {
                topic: "AI",
                slide_count: 3,
                research_payload: { sources: [{ url: "ftp://example.com" }] },
            },
            {
                topic: "AI",
                slide_count: 3,
                research_payload: {
                    sources: Array.from({ length: 9 }, (_, index) => ({
                        url: `https://example.com/${index}`,
                    })),
                },
            },
            {
                topic: "AI",
                slide_count: 3,
                research_payload: {
                    sources: [{ url: "https://example.com", summary: "x".repeat(8001) }],
                },
            },
        ];

        for (const body of invalidBodies) {
            const response = await app().request("/api/generate-presentation-stream", {
                method: "POST",
                body: JSON.stringify(body),
            });
            expect(response.status).toBe(400);
        }

        const oversized = await app().request("/api/generate-presentation-stream", {
            method: "POST",
            body: JSON.stringify({ topic: "x".repeat(257 * 1024), slide_count: 3 }),
        });
        expect(oversized.status).toBe(413);
        expect(aiConnectionService.resolveSelection).not.toHaveBeenCalled();
        expect(presentationRepository.create).not.toHaveBeenCalled();
        expect(pointAccountingService.reserveNewPresentation).not.toHaveBeenCalled();
        expect(presentationService.generatePresentationStream).not.toHaveBeenCalled();
    });

    it("accepts generation values at their documented boundaries", async () => {
        const topic = "x".repeat(400);
        const response = await app().request("/api/generate-presentation-stream", {
            method: "POST",
            body: JSON.stringify({
                topic: ` ${topic} `,
                slide_count: 40,
                detail_level: "comprehensive",
                tonality: "enthusiastic",
                research: { enabled: true, maxResults: 8, maxAgeHours: 8760 },
                research_payload: {
                    sources: Array.from({ length: 8 }, (_, index) => ({
                        url: `https://example.com/${index}`,
                        highlights: ["x".repeat(1200)],
                    })),
                },
            }),
        });

        expect(response.status).toBe(200);
        await response.text();
        expect(presentationService.generatePresentationStream).toHaveBeenCalledWith(
            expect.objectContaining({
                topic,
                slideCount: 40,
                detailLevel: "comprehensive",
                tonality: "enthusiastic",
                research: expect.objectContaining({ maxResults: 8, maxAgeHours: 8760 }),
                researchPayload: expect.objectContaining({ sources: expect.any(Array) }),
            })
        );
    });

    it("streams BYOK presentations without deducting generation points", async () => {
        const response = await app().request("/api/generate-presentation-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                topic: "Quarterly planning",
                slide_count: 3,
                detail_level: "balanced",
                tonality: "professional",
                theme: "nature-green",
                research: { enabled: true },
                research_payload: {
                    sources: [{ url: " https://example.com ", title: "Example" }],
                },
            }),
        });
        const body = await text(response);

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/event-stream");
        expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
        expect(body).toContain("event: created");
        expect(body).toContain("event: saved");
        expect(pointAccountingService.reserveNewPresentation).toHaveBeenCalledWith({
            operationId: expect.any(String),
            userId: currentUserId,
            title: "Generating...",
            prompt: "Quarterly planning",
            quotedPoints: 0,
            slidesData: {
                schemaVersion: 5,
                slides: [],
                theme: "nature-green",
                title: "Generating...",
                status: "generating",
            },
        });
        const finalUpdate = presentationUpdates.find(({ updates }) => "slidesData" in updates);
        expect(finalUpdate?.id).toBe("presentation_1");
        expect(finalUpdate?.updates).toEqual(
            expect.objectContaining({
                slidesData: expect.objectContaining({
                    dimensions: { width: 1600, height: 900 },
                    outline: expect.objectContaining({ audience: "Leadership" }),
                }),
            })
        );
        expect(presentationService.generatePresentationStream).toHaveBeenCalledWith(
            expect.objectContaining({
                theme: "nature-green",
            })
        );
        expect(presentationService.calculateEstimatedTokens).not.toHaveBeenCalled();
        expect(userRepository.deductTokens).not.toHaveBeenCalled();
        expect(body).toContain('"slide_tokens_charged":0');
        expect(aiConnectionService.markUsed).toHaveBeenCalledWith(currentUserId, "openai");
        expect(presentationService.storePresentationMemory).toHaveBeenCalledWith(
            expect.objectContaining({
                presentationId: "presentation_1",
                userId: currentUserId,
                prompt: "Quarterly planning",
                operation: "generation",
                title: "Quarterly Plan",
                theme: "modern",
            })
        );
    });

    it("uses point-funded OpenRouter generation when no provider is connected", async () => {
        aiConnectionService.resolveSelection.mockResolvedValueOnce(undefined);

        const response = await app().request("/api/generate-presentation-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: "OpenRouter fallback", slide_count: 3 }),
        });
        const body = await text(response);

        expect(response.status).toBe(200);
        expect(body).toContain("event: saved");
        expect(body).toContain('"slide_tokens_charged":0.1');
        expect(presentationService.generatePresentationStream).toHaveBeenCalledWith(
            expect.objectContaining({ ai: undefined })
        );
        expect(presentationService.calculateEstimatedTokens).toHaveBeenCalledWith(
            3,
            "balanced",
            "professional",
            "OpenRouter fallback",
            undefined
        );
        expect(presentationService.calculateActualTokenCost).toHaveBeenCalledWith(100, 3);
        expect(pointAccountingService.reserveNewPresentation).toHaveBeenCalledWith(
            expect.objectContaining({ userId: currentUserId, quotedPoints: 3 })
        );
        expect(pointAccountingService.finalizePresentation).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: currentUserId,
                presentationId: "presentation_1",
                chargedPoints: 0.1,
            })
        );
        expect(userRepository.deductTokens).not.toHaveBeenCalled();
        expect(aiConnectionService.markUsed).not.toHaveBeenCalled();
        expect(presentationUpdates[0]?.updates).toEqual(
            expect.objectContaining({
                aiProvider: "openrouter",
                aiModel: expect.any(String),
                slidesData: expect.objectContaining({ status: "ready" }),
            })
        );
    });

    it("refunds a point reservation exactly once when generation fails", async () => {
        aiConnectionService.resolveSelection.mockResolvedValueOnce(undefined);
        presentationService.generatePresentationStream.mockImplementation(async function* () {
            yield { event: "error", data: { error: "Provider failed" } };
        });

        const response = await app().request("/api/generate-presentation-stream", {
            method: "POST",
            body: JSON.stringify({ topic: "Failure", slide_count: 3 }),
        });
        const body = await response.text();

        expect(body).toContain("event: error");
        expect(pointAccountingService.reserveNewPresentation).toHaveBeenCalledTimes(1);
        expect(pointAccountingService.refund).toHaveBeenCalledTimes(1);
        expect(pointAccountingService.finalizePresentation).not.toHaveBeenCalled();
    });

    it("surfaces settlement failure and refunds instead of saving a free deck", async () => {
        aiConnectionService.resolveSelection.mockResolvedValueOnce(undefined);
        pointAccountingService.finalizePresentation.mockRejectedValueOnce(
            new Error("Settlement failed")
        );
        const originalError = console.error;
        console.error = mock();

        try {
            const response = await app().request("/api/generate-presentation-stream", {
                method: "POST",
                body: JSON.stringify({ topic: "Settlement", slide_count: 3 }),
            });
            const body = await response.text();

            expect(body).toContain('event: error\ndata: {"error":"Settlement failed"');
            expect(body).not.toContain("event: saved");
            expect(pointAccountingService.refund).toHaveBeenCalledTimes(1);
            expect(
                presentationUpdates.some(
                    ({ updates }) =>
                        (updates["slidesData"] as { status?: string } | undefined)?.status ===
                        "ready"
                )
            ).toBe(false);
        } finally {
            console.error = originalError;
        }
    });

    it("does not fail or refund a finalized deck when the saved SSE write fails", async () => {
        aiConnectionService.resolveSelection.mockResolvedValueOnce(undefined);
        failSavedWrite = true;
        const originalError = console.error;
        const originalWarn = console.warn;
        console.error = mock();
        console.warn = mock();

        try {
            const response = await app().request("/api/generate-presentation-stream", {
                method: "POST",
                body: JSON.stringify({ topic: "Committed deck", slide_count: 3 }),
            });
            const body = await response.text();

            expect(response.status).toBe(200);
            expect(body).not.toContain("event: saved");
            expect(pointAccountingService.finalizePresentation).toHaveBeenCalledTimes(1);
            expect(pointAccountingService.refund).not.toHaveBeenCalled();
            expect(
                presentationUpdates.some(
                    ({ updates }) =>
                        (updates["slidesData"] as { status?: string } | undefined)?.status ===
                        "failed"
                )
            ).toBe(false);
        } finally {
            console.error = originalError;
            console.warn = originalWarn;
        }
    });

    it("treats post-commit provider metadata as best effort", async () => {
        aiConnectionService.markUsed.mockRejectedValueOnce(new Error("Metadata unavailable"));
        const originalWarn = console.warn;
        console.warn = mock();

        try {
            const response = await app().request("/api/generate-presentation-stream", {
                method: "POST",
                body: JSON.stringify({ topic: "Provider metadata", slide_count: 3 }),
            });
            const body = await response.text();

            expect(body).toContain("event: saved");
            expect(presentationUpdates).toContainEqual(
                expect.objectContaining({
                    updates: expect.objectContaining({
                        slidesData: expect.objectContaining({ status: "ready" }),
                    }),
                })
            );
        } finally {
            console.warn = originalWarn;
        }
    });

    it("reuses the same failed presentation row across retries", async () => {
        presentationService.getPresentation.mockResolvedValue({
            id: "failed_presentation",
            slidesData: {
                title: "Failed deck",
                theme: "corporate-blue",
                slides: [],
                status: "failed",
            },
        });

        const response = await app().request("/api/generate-presentation-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                topic: "Retry the same deck",
                slide_count: 3,
                retry_presentation_id: "failed_presentation",
            }),
        });
        const body = await text(response);

        expect(body).toContain('event: created\ndata: {"presentation_id":"failed_presentation"}');
        expect(body).toContain("event: saved");
        expect(presentationRepository.create).not.toHaveBeenCalled();
        expect(presentationService.getPresentation).toHaveBeenCalledWith(
            "failed_presentation",
            currentUserId
        );
        expect(presentationUpdates.find(({ updates }) => "prompt" in updates)).toEqual(
            expect.objectContaining({
                id: "failed_presentation",
                updates: expect.objectContaining({ prompt: "Retry the same deck" }),
            })
        );
    });

    it("does not allow a completed presentation row to be retried", async () => {
        presentationService.getPresentation.mockResolvedValue({
            id: "ready_presentation",
            slidesData: {
                title: "Ready deck",
                theme: "corporate-blue",
                slides: [{ id: "slide_1" }],
                status: "ready",
            },
        });

        const response = await app().request("/api/generate-presentation-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                topic: "Do not overwrite",
                slide_count: 3,
                retry_presentation_id: "ready_presentation",
            }),
        });

        expect(response.status).toBe(409);
        expect(await json(response)).toEqual({
            error: { message: "Only failed presentations can be retried" },
        });
        expect(presentationRepository.create).not.toHaveBeenCalled();
        expect(presentationService.generatePresentationStream).not.toHaveBeenCalled();
    });

    it("stores retry data and does not charge for a partial generation that ends in error", async () => {
        presentationService.generatePresentationStream.mockImplementation(async function* () {
            yield {
                event: "slide",
                data: {
                    slide: {
                        id: "partial",
                        type: "content",
                        html: '<div id="slide-content">Partial</div>',
                    },
                    index: 0,
                    title: "Partial",
                },
            };
            yield { event: "error", data: { error: "Upstream failed" } };
        });

        const response = await app().request("/api/generate-presentation-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                topic: "Failure handling",
                slide_count: 3,
                detail_level: "detailed",
                tonality: "persuasive",
                research_payload: {
                    sources: [{ url: "https://example.com/research", title: "Research" }],
                },
            }),
        });
        const body = await text(response);

        expect(body).toContain("event: error");
        expect(body).not.toContain("event: saved");
        expect(presentationRepository.update).toHaveBeenCalledTimes(1);
        expect(presentationUpdates[0]).toEqual({
            id: "presentation_1",
            updates: {
                title: "Failure handling",
                prompt: "Failure handling",
                slidesData: {
                    schemaVersion: 5,
                    title: "Failure handling",
                    theme: "corporate-blue",
                    slides: [],
                    totalSlides: 0,
                    status: "failed",
                    failure: {
                        message: "Upstream failed",
                        retry: {
                            prompt: "Failure handling",
                            slide_count: 3,
                            detail_level: "detailed",
                            tonality: "persuasive",
                            research_enabled: true,
                            theme: "corporate-blue",
                            ai: {
                                provider: "openai",
                                model: "gpt-4.1",
                            },
                            research_payload: {
                                sources: [
                                    {
                                        url: "https://example.com/research",
                                        title: "Research",
                                        snippet: undefined,
                                        retrieved_at: undefined,
                                        published_date: undefined,
                                        author: undefined,
                                        highlights: undefined,
                                        summary: undefined,
                                    },
                                ],
                                estimated_tokens: 0,
                            },
                        },
                    },
                },
            },
        });
        expect(userRepository.deductTokens).not.toHaveBeenCalled();
        expect(presentationService.deletePresentation).not.toHaveBeenCalled();
    });

    it("clears partial slides when the AI retries generation", async () => {
        presentationService.generatePresentationStream.mockImplementation(async function* () {
            yield {
                event: "slide",
                data: {
                    slide: {
                        id: "discarded",
                        type: "content",
                        html: '<div id="slide-content">Discard me</div>',
                    },
                    index: 0,
                    title: "Discarded",
                },
            };
            yield {
                event: "retry",
                data: { attempt: 2, max_attempts: 3, delay_ms: 1, reason: "Disconnected" },
            };
            yield* successfulStream();
        });

        const response = await app().request("/api/generate-presentation-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: "Retry handling", slide_count: 3 }),
        });
        const body = await text(response);

        expect(body).toContain("event: retry");
        expect(body).toContain("event: saved");
        const finalUpdate = presentationUpdates.find(({ updates }) => "slidesData" in updates)
            ?.updates as {
            slidesData?: { schemaVersion?: number; slides?: Array<{ id?: string }> };
        };
        expect(finalUpdate.slidesData?.schemaVersion).toBe(5);
        expect(finalUpdate.slidesData?.slides?.map((slide) => slide.id)).toEqual(["slide_1"]);
        expect(userRepository.deductTokens).not.toHaveBeenCalled();
    });

    it("upserts streamed slides by index before persistence", async () => {
        presentationService.generatePresentationStream.mockImplementation(async function* () {
            yield {
                event: "slide",
                data: { slide: { id: "draft", type: "content", html: "Draft" }, index: 0 },
            };
            yield {
                event: "slide",
                data: { slide: { id: "final", type: "content", html: "Final" }, index: 0 },
            };
            yield {
                event: "complete",
                data: {
                    title: "Upserted",
                    theme: "modern",
                    slides: [{ id: "final", type: "content", html: "Final" }],
                },
            };
        });

        const response = await app().request("/api/generate-presentation-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: "Upsert slides", slide_count: 1 }),
        });

        expect(response.status).toBe(200);
        await text(response);
        const update = presentationUpdates.find(({ updates }) => "slidesData" in updates)
            ?.updates as { slidesData?: { slides?: Array<{ id?: string }> } } | undefined;
        expect(update?.slidesData?.slides?.map((slide) => slide.id)).toEqual(["final"]);
    });

    it("researches presentation topics and returns sources", async () => {
        const sources = [{ url: "https://example.com", title: "Source" }];
        searchService.webSearch.mockResolvedValue(sources);
        searchService.storeSourceChunks.mockResolvedValue(undefined);

        const response = await app().request("/api/research-presentation", {
            method: "POST",
            body: JSON.stringify({
                topic: "AI news",
                slide_count: 6,
                detail_level: "detailed",
                tonality: "persuasive",
                research: {
                    enabled: true,
                    freshness: "week",
                    maxResults: 3,
                    includeDomains: ["example.com"],
                    excludeDomains: ["spam.example"],
                    startPublishedDate: "2026-01-01",
                    endPublishedDate: "2026-06-30",
                    maxAgeHours: 48,
                },
            }),
        });

        expect(response.status).toBe(200);
        expect(await json(response)).toEqual({ sources, estimated_tokens: 3 });
        expect(searchService.webSearch).toHaveBeenCalledWith(
            "AI news",
            {
                enabled: true,
                freshness: "week",
                maxResults: 3,
                includeDomains: ["example.com"],
                excludeDomains: ["spam.example"],
                startPublishedDate: "2026-01-01",
                endPublishedDate: "2026-06-30",
                maxAgeHours: 48,
            },
            expect.any(AbortSignal)
        );
        expect(searchService.storeSourceChunks).toHaveBeenCalledWith(
            currentUserId,
            "AI news",
            sources,
            undefined,
            expect.any(AbortSignal)
        );
        expect(presentationService.calculateEstimatedTokens).toHaveBeenCalledWith(
            6,
            "detailed",
            "persuasive",
            "AI news",
            { sources }
        );
    });

    it("reports zero generation points for research when BYOK is active", async () => {
        searchService.webSearch.mockResolvedValue([]);
        searchService.storeSourceChunks.mockResolvedValue(undefined);
        aiConnectionService.getConfiguration.mockResolvedValueOnce({
            generation: { mode: "byok" },
        });

        const response = await app().request("/api/research-presentation", {
            method: "POST",
            body: JSON.stringify({
                topic: "AI news",
                slide_count: 6,
                research: { enabled: true },
            }),
        });

        expect(response.status).toBe(200);
        expect(await json(response)).toEqual({ sources: [], estimated_tokens: 0 });
        expect(presentationService.calculateEstimatedTokens).not.toHaveBeenCalled();
    });

    it("validates research requests", async () => {
        const response = await app().request("/api/research-presentation", {
            method: "POST",
            body: JSON.stringify({ topic: "AI", research: { enabled: false } }),
        });

        expect(response.status).toBe(400);
        expect(await json(response)).toEqual({
            error: { message: "research.enabled must be true" },
        });
    });

    it("rejects malformed research options before searching", async () => {
        const invalidBodies = [
            { topic: "AI", slide_count: "5", research: { enabled: true } },
            { topic: "AI", detail_level: "verbose", research: { enabled: true } },
            { topic: "AI", research: { enabled: true, maxAgeHours: 1.5 } },
            { topic: "AI", research: { enabled: false, maxResults: 9 } },
            { topic: "AI", research: { enabled: true, startPublishedDate: "2026-02-30" } },
            {
                topic: "AI",
                research: {
                    enabled: true,
                    includeDomains: Array.from({ length: 21 }, () => "example.com"),
                },
            },
        ];

        for (const body of invalidBodies) {
            const response = await app().request("/api/research-presentation", {
                method: "POST",
                body: JSON.stringify(body),
            });
            expect(response.status).toBe(400);
        }

        expect(searchService.webSearch).not.toHaveBeenCalled();
        expect(searchService.storeSourceChunks).not.toHaveBeenCalled();
    });

    it("streams presentation iterations and persists updates", async () => {
        const response = await app().request("/api/iterate-presentation-stream", {
            method: "POST",
            body: JSON.stringify({
                presentation_id: "presentation_1",
                feedback: "Make it shorter",
                slide_count: 2,
            }),
        });
        const body = await text(response);

        expect(response.status).toBe(200);
        expect(body).toContain("event: saved");
        expect(presentationService.iteratePresentationStream).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: currentUserId,
                presentationId: "presentation_1",
                feedback: "Make it shorter\n\nTarget slide count: 2.",
            })
        );
        expect(presentationUpdates[0]?.id).toBe("presentation_1");
        expect(userRepository.deductTokens).not.toHaveBeenCalled();
        expect(presentationService.storePresentationMemory).toHaveBeenCalledWith(
            expect.objectContaining({
                presentationId: "presentation_1",
                userId: currentUserId,
                prompt: "Make it shorter\n\nTarget slide count: 2.",
                operation: "iteration",
                title: "Quarterly Plan",
                theme: "modern",
            })
        );
    });

    it("quotes the existing deck size for point-funded OpenRouter iterations", async () => {
        aiConnectionService.resolveSelection.mockResolvedValueOnce(undefined);

        const response = await app().request("/api/iterate-presentation-stream", {
            method: "POST",
            body: JSON.stringify({
                presentation_id: "presentation_1",
                feedback: "Make it shorter",
            }),
        });
        const body = await text(response);

        expect(response.status).toBe(200);
        expect(body).toContain('"slide_tokens_charged":0.1');
        expect(presentationService.calculateEstimatedTokens).toHaveBeenCalledWith(
            2,
            "balanced",
            "professional"
        );
        expect(presentationService.calculateActualTokenCost).toHaveBeenCalledWith(100, 3);
        expect(pointAccountingService.reserveExistingPresentation).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: currentUserId,
                presentationId: "presentation_1",
                kind: "iteration",
                quotedPoints: 3,
            })
        );
        expect(pointAccountingService.finalizePresentation).toHaveBeenCalledWith(
            expect.objectContaining({ chargedPoints: 0.1 })
        );
        expect(userRepository.deductTokens).not.toHaveBeenCalled();
    });

    it("validates iteration requests and insufficient points", async () => {
        const missing = await app().request("/api/iterate-presentation-stream", {
            method: "POST",
            body: JSON.stringify({ presentation_id: "presentation_1" }),
        });
        aiConnectionService.resolveSelection.mockResolvedValueOnce(undefined);
        pointAccountingService.reserveExistingPresentation.mockRejectedValueOnce(
            new InsufficientGenerationPointsError(0, 3)
        );
        const insufficient = await app().request("/api/iterate-presentation-stream", {
            method: "POST",
            body: JSON.stringify({ presentation_id: "presentation_1", feedback: "Change it" }),
        });

        expect(missing.status).toBe(400);
        expect(await json(missing)).toEqual({
            error: { message: "feedback must be a string" },
        });
        expect(insufficient.status).toBe(402);
        expect(await json(insufficient)).toEqual({
            error: { message: "Insufficient points", code: "INSUFFICIENT_TOKENS" },
            slide_tokens_remaining: 0,
            slide_tokens_required: 3,
            slide_tokens_shortfall: 3,
        });
    });

    it("rejects malformed iteration input before loading or reserving a presentation", async () => {
        const invalidBodies = [
            { presentation_id: "presentation_1", feedback: "x".repeat(401) },
            { presentation_id: "presentation_1", feedback: "Change", slide_count: 0 },
            { presentation_id: "presentation_1", feedback: "Change", slide_count: null },
            {
                presentation_id: "presentation_1",
                feedback: "Change",
                detail_level: "verbose",
            },
            {
                presentation_id: "presentation_1",
                feedback: "Change",
                research: { enabled: 1 },
            },
        ];

        for (const body of invalidBodies) {
            const response = await app().request("/api/iterate-presentation-stream", {
                method: "POST",
                body: JSON.stringify(body),
            });
            expect(response.status).toBe(400);
        }

        expect(presentationService.getPresentation).not.toHaveBeenCalled();
        expect(pointAccountingService.reserveExistingPresentation).not.toHaveBeenCalled();
        expect(presentationService.iteratePresentationStream).not.toHaveBeenCalled();
    });

    it("lists presentations for the current user", async () => {
        const createdAt = new Date("2026-01-01T00:00:00.000Z");
        presentationService.getUserPresentations.mockResolvedValue({
            presentations: [
                {
                    id: "presentation_1",
                    title: "Deck",
                    prompt: "Topic",
                    slidesData: { slides: [{ id: "slide_1" }, { id: "slide_2" }] },
                    createdAt,
                    updatedAt: createdAt,
                },
            ],
            total: 1,
            hasMore: false,
        });

        const response = await app().request("/api/presentations");

        expect(response.status).toBe(200);
        expect(await json(response)).toEqual({
            presentations: [
                {
                    id: "presentation_1",
                    title: "Deck",
                    prompt: "Topic",
                    slide_count: 2,
                    status: "ready",
                    has_research: false,
                    created_at: createdAt.toISOString(),
                    updated_at: createdAt.toISOString(),
                },
            ],
            total: 1,
            limit: 20,
            offset: 0,
            has_more: false,
        });
    });

    it("paginates lists and reports research for ready and failed decks", async () => {
        const createdAt = new Date("2026-01-01T00:00:00.000Z");
        presentationService.getUserPresentations.mockResolvedValue({
            presentations: [
                {
                    id: "ready",
                    title: "Ready",
                    prompt: "Topic",
                    slidesData: {
                        status: "ready",
                        slides: [{ id: "slide_1" }],
                        sources: [{ url: "https://example.com/ready" }],
                    },
                    createdAt,
                    updatedAt: createdAt,
                },
                {
                    id: "failed",
                    title: "Failed",
                    prompt: "Topic",
                    slidesData: {
                        status: "failed",
                        slides: [],
                        failure: {
                            retry: {
                                research_payload: {
                                    sources: [{ url: "https://example.com/retry" }],
                                },
                            },
                        },
                    },
                    createdAt,
                    updatedAt: createdAt,
                },
            ],
            total: 5,
            hasMore: true,
        });

        const response = await app().request("/api/presentations?limit=2&offset=1");
        const body = await json(response);

        expect(response.status).toBe(200);
        expect(presentationService.getUserPresentations).toHaveBeenCalledWith(currentUserId, 2, 1);
        expect(body).toEqual(
            expect.objectContaining({ total: 5, limit: 2, offset: 1, has_more: true })
        );
        expect(
            body.presentations.map((item: { has_research: boolean }) => item.has_research)
        ).toEqual([true, true]);
    });

    it("rejects invalid list pagination before querying", async () => {
        for (const query of ["limit=0", "limit=101", "limit=1.5", "offset=-1"]) {
            const response = await app().request(`/api/presentations?${query}`);
            expect(response.status).toBe(400);
        }
        expect(presentationService.getUserPresentations).not.toHaveBeenCalled();
    });

    it("returns, forbids, and deletes presentations by id", async () => {
        const createdAt = new Date("2026-01-01T00:00:00.000Z");
        presentationService.getPresentation.mockResolvedValueOnce({
            id: "presentation_1",
            title: "Deck",
            prompt: "Topic",
            slidesData: { slides: [] },
            createdAt,
            updatedAt: createdAt,
        });
        const found = await app().request("/api/presentations/presentation_1");

        presentationService.getPresentation.mockRejectedValueOnce(
            new Error("Presentation not found")
        );
        const missing = await app().request("/api/presentations/missing");

        presentationService.getPresentation.mockRejectedValueOnce(
            new Error("Unauthorized access to presentation")
        );
        const forbidden = await app().request("/api/presentations/forbidden");

        presentationService.deletePresentation.mockResolvedValue(undefined);
        const deleted = await app().request("/api/presentations/presentation_1", {
            method: "DELETE",
        });

        expect(found.status).toBe(200);
        expect((await json(found)).presentation.id).toBe("presentation_1");
        expect(missing.status).toBe(404);
        expect(forbidden.status).toBe(403);
        expect(deleted.status).toBe(204);
        expect(await deleted.text()).toBe("");
    });

    it("applies authenticated presentation mutations", async () => {
        const createdAt = new Date("2026-01-01T00:00:00.000Z");
        presentationService.updatePresentation.mockResolvedValueOnce({
            id: "presentation_1",
            title: "Deck",
            prompt: "Topic",
            slidesData: {
                schemaVersion: 3,
                title: "Deck",
                theme: "nature-green",
                slides: [],
                totalSlides: 0,
            },
            createdAt,
            updatedAt: createdAt,
        });

        const response = await app().request("/api/presentations/presentation_1", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mutations: [{ type: "update-presentation", theme: "nature-green" }],
            }),
        });

        expect(response.status).toBe(200);
        expect(presentationService.updatePresentation).toHaveBeenCalledWith(
            "presentation_1",
            currentUserId,
            [
                {
                    type: "update-presentation",
                    theme: "nature-green",
                    title: undefined,
                    dimensions: undefined,
                },
            ]
        );
        expect((await json(response)).presentation.slides_data.schemaVersion).toBe(5);
    });
});
