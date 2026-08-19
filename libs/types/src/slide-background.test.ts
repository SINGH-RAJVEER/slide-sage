import { describe, expect, it } from "bun:test";
import type { ContentSlide } from "./index";
import { resolveSlideSupportVisual } from "./slide-background";

function slide(layout: ContentSlide["layout"]): ContentSlide {
	return {
		id: `slide-${layout}`,
		type: "content",
		layout,
		title: "Background composition",
		subtitle: "",
		tone: "default",
		density: "standard",
		pattern: "none",
		blocks: [
			{ id: "copy", type: "paragraph", region: "primary", text: "Copy" },
			{
				id: "visual",
				type: "image-placeholder",
				region: "media",
				alt: "Supporting visual",
				caption: "",
				focalPoint: "right",
			},
		],
	};
}

describe("support visual backgrounds", () => {
	it("uses a faded full background for covers and sections", () => {
		for (const layout of ["cover", "section"] as const) {
			expect(resolveSlideSupportVisual(slide(layout))).toMatchObject({
				placement: "full",
				overlay: "strong",
				focalPoint: "right",
			});
		}
	});

	it("uses a full-slide background for media layouts", () => {
		expect(resolveSlideSupportVisual(slide("media-left"))?.placement).toBe("full");
		expect(resolveSlideSupportVisual(slide("media-right"))?.placement).toBe("full");
	});

	it("leaves visuals as foreground content in other layouts", () => {
		expect(resolveSlideSupportVisual(slide("body"))).toBeUndefined();
	});
});
