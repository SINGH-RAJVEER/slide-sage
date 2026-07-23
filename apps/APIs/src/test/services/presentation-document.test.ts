import { describe, expect, it } from "bun:test";
import {
    applyPresentationMutations,
    normalizePresentationDocument,
    parsePresentationMutationRequest,
} from "../../services/presentation-document";

const legacyDocument = {
    schemaVersion: 2,
    title: "Legacy deck",
    theme: "corporate-blue",
    slides: [
        {
            id: "slide-1",
            type: "content",
            layout: "content",
            title: "Introduction",
            subtitle: "",
            blocks: [{ type: "paragraph", region: "main", text: "Hello" }],
        },
        {
            id: "slide-2",
            type: "content",
            layout: "content",
            title: "Next",
            subtitle: "",
            blocks: [],
        },
    ],
};

describe("presentation document", () => {
    it("upcasts legacy documents with deterministic identities", () => {
        const first = normalizePresentationDocument(legacyDocument);
        const second = normalizePresentationDocument(legacyDocument);

        expect(first.schemaVersion).toBe(3);
        expect(first.dimensions).toEqual({ width: 1280, height: 720 });
        expect(
            first.slides[0] && "blocks" in first.slides[0] ? first.slides[0].blocks[0]?.id : null
        ).toBe("slide-1-block-1");
        expect(first).toEqual(second);
    });

    it("applies updates, reordering, and deletion as one document operation", () => {
        const document = normalizePresentationDocument(legacyDocument);
        const firstSlide = document.slides[0];
        if (!firstSlide) throw new Error("Expected the fixture to contain a slide");
        const updatedSlide = { ...firstSlide, title: "Updated opening" };
        const next = applyPresentationMutations(document, [
            { type: "update-presentation", theme: "nature-green" },
            { type: "update-slide", slideId: "slide-1", slide: updatedSlide },
            { type: "reorder-slides", slideIds: ["slide-2", "slide-1"] },
            { type: "delete-slide", slideId: "slide-2" },
        ]);

        expect(next.theme).toBe("nature-green");
        expect(next.totalSlides).toBe(1);
        expect(next.slides[0]?.id).toBe("slide-1");
        expect(next.slides[0] && "title" in next.slides[0] ? next.slides[0].title : "").toBe(
            "Updated opening"
        );
    });

    it("rejects incomplete reorder operations and deleting the final slide", () => {
        const document = normalizePresentationDocument(legacyDocument);
        expect(() =>
            applyPresentationMutations(document, [
                { type: "reorder-slides", slideIds: ["slide-1"] },
            ])
        ).toThrow("every slide exactly once");
        const single = applyPresentationMutations(document, [
            { type: "delete-slide", slideId: "slide-2" },
        ]);
        expect(() =>
            applyPresentationMutations(single, [{ type: "delete-slide", slideId: "slide-1" }])
        ).toThrow("at least one slide");
    });

    it("validates mutation request shapes", () => {
        expect(
            parsePresentationMutationRequest({
                mutations: [{ type: "delete-slide", slideId: "slide-1" }],
            })
        ).toEqual({ mutations: [{ type: "delete-slide", slideId: "slide-1" }] });
        expect(() => parsePresentationMutationRequest({ mutations: [] })).toThrow(
            "At least one presentation mutation"
        );
        expect(() =>
            parsePresentationMutationRequest({
                mutations: Array.from({ length: 51 }, () => ({
                    type: "delete-slide",
                    slideId: "slide-1",
                })),
            })
        ).toThrow("more than 50 mutations");
    });

    it("drops malformed stored slides and sanitizes malformed slide updates", () => {
        const document = normalizePresentationDocument({
            ...legacyDocument,
            slides: [null, ...legacyDocument.slides],
        });
        expect(document.slides).toHaveLength(2);
        const next = applyPresentationMutations(document, [
            {
                type: "update-slide",
                slideId: "slide-1",
                slide: { id: "slide-1", type: "content" } as never,
            },
        ]);
        const slide = next.slides[0];
        expect(slide?.type).toBe("content");
        expect(slide && "blocks" in slide ? slide.blocks : null).toEqual([]);
        expect(() =>
            applyPresentationMutations(document, [
                {
                    type: "update-slide",
                    slideId: "slide-1",
                    slide: { id: "slide-1", type: "unsupported" } as never,
                },
            ])
        ).toThrow("Invalid slide update");
        expect(document.slides).toHaveLength(2);
    });

    it("preserves block identity after an invalid preceding block", () => {
        const document = normalizePresentationDocument({
            ...legacyDocument,
            slides: [
                {
                    ...legacyDocument.slides[0],
                    blocks: [
                        { id: "invalid", type: "unsupported", region: "main" },
                        {
                            id: "kept",
                            type: "paragraph",
                            region: "main",
                            sourceIds: ["source-1"],
                            text: "Kept content",
                        },
                    ],
                },
            ],
        });
        const slide = document.slides[0];
        const block = slide && "blocks" in slide ? slide.blocks[0] : undefined;

        expect(block?.id).toBe("kept");
        expect(block?.sourceIds).toEqual(["source-1"]);
    });
});
