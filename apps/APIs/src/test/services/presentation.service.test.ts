import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { PresentationService as PresentationServiceInstance } from "../../services/presentation.service";

type PresentationRecord = {
    id: string;
    userId: string;
    title: string;
    prompt: string;
    slidesData: { slides: unknown[] };
    createdAt: Date;
    updatedAt: Date;
    parentPresentationId: string | null;
};

const repository = {
    create: mock(),
    findById: mock(),
    findByUserId: mock(),
    delete: mock(),
    update: mock(),
    updateOwnedAtRevision: mock(),
    findIterations: mock(),
};

mock.module("@slide-sage/database", () => {
    return {
        PresentationRepository: class {
            create = repository.create;
            findById = repository.findById;
            findByUserId = repository.findByUserId;
            delete = repository.delete;
            update = repository.update;
            updateOwnedAtRevision = repository.updateOwnedAtRevision;
            findIterations = repository.findIterations;
        },
        TokenCalculator: {
            calculateEstimatedTokens: ({
                slideCount,
                detailLevel,
                tonality,
                researchContext,
            }: {
                slideCount: number;
                detailLevel: string;
                tonality: string;
                researchContext?: string;
            }) => ({
                estimatedTokens:
                    slideCount *
                        (detailLevel === "detailed" ? 2 : 1) *
                        (tonality === "persuasive" ? 1.1 : 1) +
                    (researchContext ? 1 : 0),
            }),
            getTokenPricingTiers: () => [],
            getDailyLoginBonus: () => 0,
            getDetailLevelInfo: (level: string) => ({ level }),
            getTonalityInfo: (tonality: string) => ({ tonality }),
        },
        db: {},
        deckMemories: {},
        exampleGenerations: {},
        feedbackMemories: {},
        promptEvents: {},
        ragContext: {},
        semanticCommands: {},
        slideEmbeddings: {},
        slideTemplates: {},
        sourceChunks: {},
        styleMemories: {},
    };
});

const { PresentationService } = await import("../../services/presentation.service");

async function collect<T>(generator: AsyncGenerator<T, void, unknown>): Promise<T[]> {
    const events: T[] = [];
    for await (const event of generator) {
        events.push(event);
    }
    return events;
}

describe("PresentationService", () => {
    beforeEach(() => {
        repository.create.mockReset();
        repository.findById.mockReset();
        repository.findByUserId.mockReset();
        repository.delete.mockReset();
        repository.update.mockReset();
        repository.updateOwnedAtRevision.mockReset();
        repository.findIterations.mockReset();
    });

    it("delegates token estimates to the shared calculator", () => {
        const service = new PresentationService();

        expect(service.calculateEstimatedTokens(5, "detailed", "persuasive")).toBe(11);
        expect(
            service.calculateEstimatedTokens(5, "balanced", "professional", "Storage", {
                sources: [{ url: "https://example.com", summary: "Research context" }],
            })
        ).toBe(6);
    });

    it("returns a presentation when the requesting user owns it", async () => {
        const presentation: PresentationRecord = {
            id: "presentation_1",
            userId: "user_1",
            title: "Roadmap",
            prompt: "Build a roadmap deck",
            slidesData: { slides: [] },
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            parentPresentationId: null,
        };
        repository.findById.mockResolvedValue(presentation);

        const service = new PresentationService();

        await expect(service.getPresentation("presentation_1", "user_1")).resolves.toBe(
            presentation
        );
        expect(repository.findById).toHaveBeenCalledWith("presentation_1");
    });

    it("rejects missing or unauthorized presentation access", async () => {
        const service = new PresentationService();

        repository.findById.mockResolvedValue(undefined);
        await expect(service.getPresentation("missing", "user_1")).rejects.toThrow(
            "Presentation not found"
        );

        repository.findById.mockResolvedValue({
            id: "presentation_1",
            userId: "other_user",
        });
        await expect(service.getPresentation("presentation_1", "user_1")).rejects.toThrow(
            "Unauthorized access to presentation"
        );
    });

    it("preserves the row title and uses compare-and-swap for document updates", async () => {
        const updatedAt = new Date("2026-01-01T00:00:00.000Z");
        const presentation = {
            id: "presentation_1",
            userId: "user_1",
            title: "Roadmap",
            prompt: "Build a roadmap deck",
            slidesData: {
                slides: [
                    {
                        id: "slide-1",
                        type: "content",
                        layout: "content",
                        title: "Plan",
                        subtitle: "",
                        blocks: [],
                    },
                ],
            },
            createdAt: updatedAt,
            updatedAt,
            parentPresentationId: null,
        };
        repository.findById.mockResolvedValue(presentation);
        repository.updateOwnedAtRevision.mockResolvedValue({ ...presentation, title: "Roadmap" });

        const service = new PresentationService();
        await service.updatePresentation("presentation_1", "user_1", [
            { type: "update-presentation", theme: "nature-green" },
        ]);

        expect(repository.updateOwnedAtRevision).toHaveBeenCalledWith(
            "presentation_1",
            "user_1",
            updatedAt,
            expect.objectContaining({
                title: "Roadmap",
                slidesData: expect.objectContaining({ title: "Roadmap", theme: "nature-green" }),
            })
        );
    });

    it("checks ownership before deleting a presentation", async () => {
        repository.findById.mockResolvedValue({
            id: "presentation_1",
            userId: "user_1",
        });

        const service = new PresentationService();
        await service.deletePresentation("presentation_1", "user_1");

        expect(repository.delete).toHaveBeenCalledWith("presentation_1");
    });

    it("streams generation events from the AI service", async () => {
        const service: PresentationServiceInstance = new PresentationService();
        Object.defineProperty(service, "aiService", {
            value: {
                async *generatePresentationStream() {
                    yield { event: "start", data: { message: "Generating" } };
                    yield { event: "complete", data: { slides: [] } };
                },
            } satisfies {
                generatePresentationStream: () => AsyncGenerator<unknown, void, unknown>;
            },
            configurable: true,
        });

        const events = await collect(
            service.generatePresentationStream({
                userId: "user_1",
                operationId: "operation_1",
                topic: "Quarterly planning",
                slideCount: 3,
            })
        );

        expect(events).toHaveLength(2);
        expect(events[0]?.event).toBe("start");
        expect(JSON.stringify(events[0]?.data)).toBe(JSON.stringify({ message: "Generating" }));
        expect(events[1]?.event).toBe("complete");
        expect(JSON.stringify(events[1]?.data)).toBe(JSON.stringify({ slides: [] }));
    });

    it("emits a stable generation error event when AI generation fails", async () => {
        const originalError = console.error;
        console.error = mock();
        const service: PresentationServiceInstance = new PresentationService();
        Object.defineProperty(service, "aiService", {
            value: {
                async *generatePresentationStream() {
                    yield* (async function* emptyStream() {})();
                    throw new Error("provider failed");
                },
            } satisfies {
                generatePresentationStream: () => AsyncGenerator<unknown, void, unknown>;
            },
            configurable: true,
        });

        try {
            const events = await collect(
                service.generatePresentationStream({
                    userId: "user_1",
                    operationId: "operation_1",
                    topic: "Quarterly planning",
                    slideCount: 3,
                })
            );

            expect(events).toEqual([
                {
                    event: "error",
                    data: { error: "Generation failed. Please try again." },
                },
            ]);
        } finally {
            console.error = originalError;
        }
    });
});
