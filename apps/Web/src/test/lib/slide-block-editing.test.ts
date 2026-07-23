import { describe, expect, it } from "bun:test";
import {
    createDefaultBlock,
    duplicateBlock,
    moveBlock,
    prepareEditableBlocks,
    validateBlocks,
} from "@/lib/slide-block-editing";

describe("slide block editing", () => {
    it("prepares stable unique IDs and layout regions", () => {
        const blocks = prepareEditableBlocks(
            "slide-1",
            [
                { id: "same", type: "paragraph", region: "main", text: "One" },
                { id: "same", type: "paragraph", region: "main", text: "Two" },
            ],
            "two-column",
        );

        expect(blocks[0]?.id).toBe("same");
        expect(blocks[1]?.id).not.toBe("same");
        expect(blocks.map((block) => block.region)).toEqual(["left", "left"]);
    });

    it("creates, duplicates, and reorders blocks without changing source content", () => {
        const first = createDefaultBlock("slide-1", "paragraph", "content");
        const copy = duplicateBlock("slide-1", first);
        const moved = moveBlock([first, copy], 1, -1);

        expect(copy.id).not.toBe(first.id);
        expect(copy).toMatchObject({ type: "paragraph", text: "New paragraph" });
        expect(moved.map((block) => block.id)).toEqual([copy.id, first.id]);
    });

    it("validates user-facing block constraints", () => {
        const paragraph = createDefaultBlock("slide-1", "paragraph", "content");
        if (paragraph.type !== "paragraph") throw new Error("Expected a paragraph block");
        expect(validateBlocks([{ ...paragraph, text: "" }])).toBe("Paragraphs cannot be empty.");

        const image = createDefaultBlock("slide-1", "image", "image-right");
        if (image.type !== "image") throw new Error("Expected an image block");
        expect(validateBlocks([image])).toBe("Image URLs must be valid HTTPS links.");
        expect(validateBlocks([{ ...image, url: "https://example.com/image.jpg" }])).toBeNull();
    });
});
