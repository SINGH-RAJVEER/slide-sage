import { describe, expect, it } from "bun:test";
import { applySlideLayout } from "@/lib/slide-layout";
import type { ContentSlide } from "@/modules/types/presentation";

const slide: ContentSlide = {
    id: "slide-1",
    type: "content",
    layout: "content",
    title: "Product workflow",
    subtitle: "",
    blocks: [
        { type: "paragraph", region: "main", text: "First point" },
        { type: "callout", region: "main", heading: "Result", text: "Second point" },
    ],
};

describe("applySlideLayout", () => {
    it("adds a visual placeholder when switching to image-right", () => {
        const updated = applySlideLayout(slide, "image-right");

        expect(updated.layout).toBe("image-right");
        expect(updated.blocks.filter((block) => block.region === "main")).toHaveLength(2);
        expect(updated.blocks.find((block) => block.type === "image-placeholder")).toMatchObject({
            type: "image-placeholder",
            region: "right",
            alt: "Supporting visual for Product workflow",
            caption: "Add an image",
        });
    });

    it("removes the layout-generated placeholder when switching back to content", () => {
        const imageRight = applySlideLayout(slide, "image-right");
        const updated = applySlideLayout(imageRight, "content");

        expect(updated.layout).toBe("content");
        expect(updated.blocks.some((block) => block.type === "image-placeholder")).toBe(false);
        expect(updated.blocks).toHaveLength(slide.blocks.length);
    });

    it("keeps placeholders that came from the presentation content", () => {
        const authoredPlaceholder: ContentSlide = {
            ...slide,
            layout: "image-right",
            blocks: [
                ...slide.blocks,
                {
                    type: "image-placeholder",
                    region: "right",
                    alt: "Customer using the product",
                    caption: "Add customer photography",
                },
            ],
        };

        const updated = applySlideLayout(authoredPlaceholder, "content");

        expect(updated.blocks.find((block) => block.type === "image-placeholder")).toEqual({
            type: "image-placeholder",
            region: "main",
            alt: "Customer using the product",
            caption: "Add customer photography",
        });
    });

    it("distributes unassigned content across two columns", () => {
        const updated = applySlideLayout(slide, "two-column");

        expect(updated.blocks.map((block) => block.region)).toEqual(["left", "right"]);
    });

    it("returns all blocks to the main region for single-column layouts", () => {
        const twoColumn = applySlideLayout(slide, "two-column");
        const updated = applySlideLayout(twoColumn, "content");

        expect(updated.blocks.every((block) => block.region === "main")).toBe(true);
    });
});
