import { describe, expect, it } from "bun:test";
import { applySlideLayout } from "@/lib/slide-layout";
import type { ContentSlide } from "@/modules/types/presentation";

const slide: ContentSlide = {
	id: "slide-1",
	type: "content",
	layout: "body",
	title: "Product workflow",
	subtitle: "",
	tone: "default",
	density: "standard",
	pattern: "none",
	blocks: [
		{ type: "paragraph", region: "main", text: "First point" },
		{ type: "callout", region: "main", heading: "Result", text: "Second point" },
		{ type: "stats", region: "main", items: [{ value: "3x", label: "Faster" }] },
		{ type: "quote", region: "main", text: "A fourth point", attribution: "Team" },
	],
};

describe("applySlideLayout", () => {
	it("adds a media placeholder and assigns schema-v5 regions", () => {
		const updated = applySlideLayout(slide, "media-right");

		expect(updated.blocks.filter((block) => block.region === "primary")).toHaveLength(2);
		expect(updated.blocks.filter((block) => block.region === "secondary")).toHaveLength(2);
		expect(updated.blocks.find((block) => block.type === "image-placeholder")).toMatchObject({
			region: "media",
			alt: "Supporting visual for Product workflow",
		});
	});

	it("removes only generated placeholders when leaving media layouts", () => {
		const media = applySlideLayout(slide, "media-left");
		const updated = applySlideLayout(media, "body");

		expect(updated.blocks.some((block) => block.type === "image-placeholder")).toBe(false);
		expect(updated.blocks).toHaveLength(slide.blocks.length);
		expect(updated.blocks.every((block) => block.region === "main")).toBe(true);
	});

	it("keeps authored placeholders when changing layouts", () => {
		const authored: ContentSlide = {
			...slide,
			blocks: [
				...slide.blocks,
				{
					type: "image-placeholder",
					region: "media",
					alt: "Customer using the product",
					caption: "Add customer photography",
				},
			],
		};
		const updated = applySlideLayout(authored, "body");

		expect(updated.blocks.find((block) => block.type === "image-placeholder")).toMatchObject({
			region: "main",
			alt: "Customer using the product",
		});
	});

	it("distributes paired and sidebar compositions deterministically", () => {
		expect(applySlideLayout(slide, "comparison").blocks.map((block) => block.region)).toEqual([
			"primary",
			"secondary",
			"primary",
			"secondary",
		]);
		expect(applySlideLayout(slide, "sidebar").blocks.map((block) => block.region)).toEqual([
			"primary",
			"primary",
			"primary",
			"secondary",
		]);
	});

	it("assigns a spotlight hero and support strip", () => {
		const emphasized: ContentSlide = {
			...slide,
			blocks: slide.blocks.map((block, index) =>
				index === 2 ? { ...block, emphasis: "hero" as const } : block,
			),
		};
		const updated = applySlideLayout(emphasized, "spotlight");

		expect(updated.blocks.map((block) => block.region)).toEqual([
			"secondary",
			"secondary",
			"primary",
			"secondary",
		]);
	});

	it("clears object bounds when changing the semantic layout", () => {
		const positioned: ContentSlide = {
			...slide,
			titleBounds: { x: 80, y: 80, width: 480, height: 120 },
			subtitleBounds: { x: 80, y: 216, width: 480, height: 64 },
			blocks: slide.blocks.map((block, index) =>
				index === 0 ? { ...block, bounds: { x: 80, y: 320, width: 520, height: 160 } } : block,
			),
		};
		const updated = applySlideLayout(positioned, "comparison");

		expect(updated.titleBounds).toBeUndefined();
		expect(updated.subtitleBounds).toBeUndefined();
		expect(updated.blocks.every((block) => block.bounds === undefined)).toBe(true);
	});
});
