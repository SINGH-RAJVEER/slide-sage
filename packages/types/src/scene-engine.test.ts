import { describe, expect, it } from "bun:test";
import { resolveScene, slideToScene } from "./scene-engine";

describe("scene engine", () => {
    it("resolves nested stack and grid layouts deterministically", () => {
        const slide = slideToScene({
            id: "slide-1",
            type: "content",
            layout: "image-right",
            title: "A dynamic composition",
            subtitle: "One semantic slide, multiple targets",
            blocks: [
                { id: "body", type: "paragraph", region: "main", text: "Supporting context" },
                {
                    id: "visual",
                    type: "image-placeholder",
                    region: "right",
                    alt: "Editorial visual",
                    caption: "",
                },
            ],
        });

        const first = resolveScene(slide, { width: 1280, height: 720 });
        const second = resolveScene(slide, { width: 1280, height: 720 });

        expect(second).toEqual(first);
        expect(first.root.children?.map((node) => node.id)).toEqual([
            "slide-1-title",
            "slide-1-subtitle",
            "slide-1-composition",
        ]);
        expect(first.root.children?.[2]?.children).toHaveLength(2);
    });

    it("uses responsive replacement scenes without changing semantic node IDs", () => {
        const slide = slideToScene({
            id: "slide-2",
            type: "content",
            layout: "image-right",
            title: "Responsive",
            subtitle: "",
            blocks: [
                { id: "copy", type: "paragraph", region: "main", text: "Copy" },
                {
                    id: "image",
                    type: "image-placeholder",
                    region: "right",
                    alt: "Image",
                    caption: "",
                },
            ],
        });

        const compact = resolveScene(slide, { width: 720, height: 1280 }, "compact");
        const childIds = compact.root.children?.map((node) => node.id);

        expect(childIds).toContain("copy");
        expect(childIds).toContain("image");
    });

    it("does not double parent offsets for nested overlays", () => {
        const resolved = resolveScene(
            {
                id: "overlay",
                type: "scene",
                root: {
                    id: "root",
                    type: "group",
                    order: 0,
                    layout: "absolute",
                    children: [
                        {
                            id: "nested",
                            type: "group",
                            order: 0,
                            layout: "overlay",
                            bounds: { x: 100, y: 80, width: 400, height: 300 },
                            children: [{ id: "fill", type: "shape", order: 0, shape: "rectangle" }],
                        },
                    ],
                },
            },
            { width: 1280, height: 720 },
        );

        expect(resolved.root.children?.[0]?.children?.[0]?.bounds).toEqual({
            x: 100,
            y: 80,
            width: 400,
            height: 300,
        });
    });
});
