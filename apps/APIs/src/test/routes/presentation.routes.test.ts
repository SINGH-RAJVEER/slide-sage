import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const currentUserId = "user_1";
const presentationUpdates: Array<{ id: string; updates: unknown }> = [];

const userRepository = {
    deductTokens: mock(),
    hasSufficientTokens: mock(),
};

const presentationRepository = {
    create: mock(),
    update: mock(),
};

const presentationService = {
    calculateEstimatedTokens: mock(),
    deletePresentation: mock(),
    generatePresentationStream: mock(),
    getPresentation: mock(),
    getUserPresentations: mock(),
    iteratePresentationStream: mock(),
    storePresentationMemory: mock(),
};

const searchService = {
    storeSourceChunks: mock(),
    webSearch: mock(),
};

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

mock.module("@slide-sage/database", () => ({
    UserRepository: userRepository,
    PresentationRepository: class {
        create = presentationRepository.create;
        update = (id: string, updates: unknown) => {
            presentationUpdates.push({ id, updates });
            return presentationRepository.update(id, updates);
        };
    },
}));

mock.module("../../services/presentation.service", () => ({
    PresentationService: class {
        calculateEstimatedTokens = presentationService.calculateEstimatedTokens;
        deletePresentation = presentationService.deletePresentation;
        generatePresentationStream = presentationService.generatePresentationStream;
        getPresentation = presentationService.getPresentation;
        getUserPresentations = presentationService.getUserPresentations;
        iteratePresentationStream = presentationService.iteratePresentationStream;
        storePresentationMemory = presentationService.storePresentationMemory;
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
        },
    };
}

describe("presentation routes", () => {
    beforeEach(() => {
        presentationUpdates.length = 0;
        userRepository.deductTokens.mockReset();
        userRepository.hasSufficientTokens.mockReset();
        presentationRepository.create.mockReset();
        presentationRepository.update.mockReset();
        presentationService.calculateEstimatedTokens.mockReset();
        presentationService.deletePresentation.mockReset();
        presentationService.generatePresentationStream.mockReset();
        presentationService.getPresentation.mockReset();
        presentationService.getUserPresentations.mockReset();
        presentationService.iteratePresentationStream.mockReset();
        presentationService.storePresentationMemory.mockReset();
        searchService.storeSourceChunks.mockReset();
        searchService.webSearch.mockReset();

        presentationService.calculateEstimatedTokens.mockReturnValue(3);
        userRepository.hasSufficientTokens.mockResolvedValue({
            sufficient: true,
            user: { slideTokens: 20 },
            shortfall: 0,
        });
        userRepository.deductTokens.mockResolvedValue({ slideTokens: 17 });
        presentationRepository.create.mockResolvedValue({ id: "presentation_1" });
        presentationRepository.update.mockResolvedValue({});
        presentationService.generatePresentationStream.mockImplementation(successfulStream);
        presentationService.iteratePresentationStream.mockImplementation(successfulStream);
        presentationService.storePresentationMemory.mockResolvedValue(undefined);
    });

    it("validates generation requests and insufficient points", async () => {
        const missing = await app().request("/api/generate-presentation-stream", {
            method: "POST",
            body: JSON.stringify({ topic: "AI" }),
        });

        userRepository.hasSufficientTokens.mockResolvedValueOnce({
            sufficient: false,
            user: { slideTokens: 1 },
            shortfall: 2,
        });
        const insufficient = await app().request("/api/generate-presentation-stream", {
            method: "POST",
            body: JSON.stringify({ topic: "AI", slide_count: 3 }),
        });

        expect(missing.status).toBe(400);
        expect(await json(missing)).toEqual({ error: { message: "Missing required fields" } });
        expect(insufficient.status).toBe(402);
        expect(await json(insufficient)).toEqual({
            error: { message: "Insufficient points", code: "INSUFFICIENT_TOKENS" },
            slide_tokens_remaining: 1,
            slide_tokens_required: 3,
            slide_tokens_shortfall: 2,
        });
    });

    it("streams generated presentations, persists final data, and deducts points", async () => {
        const response = await app().request("/api/generate-presentation-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                topic: "Quarterly planning",
                slide_count: 3,
                detail_level: "balanced",
                tonality: "professional",
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
        expect(presentationRepository.create).toHaveBeenCalledWith(
            currentUserId,
            "Generating...",
            "Quarterly planning",
            { slides: [], theme: "corporate-blue", title: "Generating..." }
        );
        expect(presentationUpdates[0]?.id).toBe("presentation_1");
        expect(presentationService.calculateEstimatedTokens).toHaveBeenCalledWith(
            3,
            "balanced",
            "professional",
            "Quarterly planning",
            { sources: [{ url: "https://example.com", title: "Example" }] }
        );
        expect(userRepository.deductTokens).toHaveBeenCalledWith(currentUserId, 3);
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

    it("does not persist or charge for a partial generation that ends in error", async () => {
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
            body: JSON.stringify({ topic: "Failure handling", slide_count: 3 }),
        });
        const body = await text(response);

        expect(body).toContain("event: error");
        expect(body).not.toContain("event: saved");
        expect(presentationRepository.update).not.toHaveBeenCalled();
        expect(userRepository.deductTokens).not.toHaveBeenCalled();
        expect(presentationService.deletePresentation).toHaveBeenCalledWith(
            "presentation_1",
            currentUserId
        );
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
        const finalUpdate = presentationUpdates[0]?.updates as {
            slidesData?: { slides?: Array<{ id?: string }> };
        };
        expect(finalUpdate.slidesData?.slides?.map((slide) => slide.id)).toEqual(["slide_1"]);
        expect(userRepository.deductTokens).toHaveBeenCalledTimes(1);
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
        expect(searchService.webSearch).toHaveBeenCalledWith("AI news", {
            enabled: true,
            freshness: "week",
            maxResults: 3,
            includeDomains: ["example.com"],
            excludeDomains: ["spam.example"],
            startPublishedDate: "2026-01-01",
            endPublishedDate: "2026-06-30",
            maxAgeHours: 48,
        });
        expect(searchService.storeSourceChunks).toHaveBeenCalledWith(
            currentUserId,
            "AI news",
            sources
        );
        expect(presentationService.calculateEstimatedTokens).toHaveBeenCalledWith(
            6,
            "detailed",
            "persuasive",
            "AI news",
            { sources }
        );
    });

    it("validates research requests", async () => {
        const response = await app().request("/api/research-presentation", {
            method: "POST",
            body: JSON.stringify({ topic: "AI", research: { enabled: false } }),
        });

        expect(response.status).toBe(400);
        expect(await json(response)).toEqual({ error: { message: "Missing required fields" } });
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
        expect(userRepository.deductTokens).toHaveBeenCalledWith(currentUserId, 3);
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

    it("validates iteration requests and insufficient points", async () => {
        const missing = await app().request("/api/iterate-presentation-stream", {
            method: "POST",
            body: JSON.stringify({ presentation_id: "presentation_1" }),
        });
        userRepository.hasSufficientTokens.mockResolvedValueOnce({
            sufficient: false,
            user: { slideTokens: 0 },
            shortfall: 3,
        });
        const insufficient = await app().request("/api/iterate-presentation-stream", {
            method: "POST",
            body: JSON.stringify({ presentation_id: "presentation_1", feedback: "Change it" }),
        });

        expect(missing.status).toBe(400);
        expect(await json(missing)).toEqual({ error: { message: "Missing required fields" } });
        expect(insufficient.status).toBe(402);
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
                    created_at: createdAt.toISOString(),
                    updated_at: createdAt.toISOString(),
                },
            ],
        });
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
        expect(deleted.status).toBe(200);
        expect(await json(deleted)).toEqual({ message: "Presentation deleted successfully" });
    });
});
