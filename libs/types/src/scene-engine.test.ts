import { describe, expect, it } from "bun:test";
import { resolveScene, slideToScene } from "./scene-engine";

describe("scene engine", () => {
	it("pairs embedded chart blocks with explanatory text in a split composition", () => {
		const slide = slideToScene({
			id: "slide-chart",
			type: "content",
			layout: "split",
			title: "Adoption trend",
			subtitle: "",
			blocks: [
				{ id: "copy", type: "paragraph", region: "primary", text: "Adoption doubled in a year." },
				{
					id: "chart",
					type: "chart",
					region: "secondary",
					chartConfig: {
						type: "bar",
						data: { labels: ["Q1", "Q2"], datasets: [{ label: "Teams", data: [12, 24] }] },
					},
				},
			],
		});

		const resolved = resolveScene(slide, { width: 1280, height: 720 });
		const composition = resolved.root.children?.find(
			(node) => node.id === "slide-chart-composition",
		);
		expect(composition?.children).toHaveLength(2);
		const widget = composition?.children?.find((node) => node.id === "chart");
		expect(widget?.type).toBe("widget");
		const body = composition?.children?.find((node) => node.id === "slide-chart-body");
		if (!widget) throw new Error("Expected chart widget");
		expect(body?.bounds.x).toBeLessThan(widget.bounds.x);
	});

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

	it("uses intrinsic text sizes and fits long copy within its allocation", () => {
		const resolved = resolveScene(
			{
				id: "fitted-copy",
				type: "scene",
				root: {
					id: "root",
					type: "group",
					order: 0,
					layout: "stack",
					direction: "vertical",
					gap: 24,
					padding: { top: 60, right: 70, bottom: 60, left: 70 },
					children: [
						{
							id: "title",
							type: "text",
							order: 0,
							role: "title",
							text: "A deliberately long title that must fit on no more than two lines",
							maxLines: 2,
							minFontSize: 28,
						},
						{
							id: "body",
							type: "text",
							order: 1,
							role: "body",
							text: Array.from({ length: 30 }, () => "measured presentation copy").join(" "),
							maxLines: 8,
							minFontSize: 16,
						},
					],
				},
			},
			{ width: 1280, height: 720 },
		);
		const title = resolved.root.children?.[0];
		const body = resolved.root.children?.[1];

		expect(title?.bounds.height).toBeLessThan(body?.bounds.height || 0);
		expect(title?.style?.fontSize).toBeGreaterThanOrEqual(28);
		expect(body?.style?.fontSize).toBeGreaterThanOrEqual(16);
		expect((body?.bounds.y || 0) + (body?.bounds.height || 0)).toBeLessThanOrEqual(660);
	});

	it("preserves authored object rectangles during normal rendering", () => {
		const resolved = resolveScene(
			{
				id: "grid-aligned",
				type: "scene",
				root: {
					id: "root",
					type: "group",
					order: 0,
					layout: "absolute",
					children: [
						{
							id: "object",
							type: "shape",
							order: 0,
							shape: "rectangle",
							bounds: { x: 101, y: 83, width: 203, height: 119 },
						},
					],
				},
			},
			{ width: 1280, height: 720 },
		);
		const bounds = resolved.root.children?.[0]?.bounds;
		expect(bounds).toEqual({ x: 101, y: 83, width: 203, height: 119 });
	});
});
