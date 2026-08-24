/// <reference lib="dom" />

import { describe, expect, it } from "bun:test";
import type { ContentSlide, Slide, SlideBlock, SlideLayout } from "@slidesage/types";
import { SlideRenderer } from "@slidesage/ui/components/Viewer/SlideRenderer";
import { render } from "@testing-library/react";

function contentSlide(
	layout: SlideLayout,
	blocks: SlideBlock[],
	overrides: Partial<ContentSlide> = {},
): ContentSlide {
	return {
		id: `slide-${layout}`,
		type: "content",
		layout,
		title: "Editorial systems",
		subtitle: "A deterministic composition",
		tone: "default",
		density: "standard",
		pattern: "none",
		blocks,
		...overrides,
	};
}

function renderSlide(slide: Slide, isActive = true) {
	return render(
		<SlideRenderer slide={slide} currentTemplate="corporate-blue" isActive={isActive} />,
	);
}

describe("SlideRenderer", () => {
	it("renders model strings as text rather than executable markup", () => {
		const { container, getByText } = renderSlide(
			contentSlide("body", [
				{
					type: "paragraph",
					region: "main",
					text: '<img src=x onerror="globalThis.compromised=true">',
				},
			]),
		);

		expect(getByText('<img src=x onerror="globalThis.compromised=true">')).toBeInTheDocument();
		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector("script")).toBeNull();
	});

	it("renders all editorial compositions with their canonical regions", () => {
		const layouts: SlideLayout[] = [
			"cover",
			"section",
			"body",
			"split",
			"comparison",
			"sidebar",
			"media-left",
			"media-right",
			"quote",
			"spotlight",
			"canvas",
		];
		for (const layout of layouts) {
			const view = renderSlide(
				contentSlide(layout, [
					{ id: "one", type: "paragraph", region: "primary", text: "Primary" },
					{
						id: "two",
						type: "callout",
						region: "secondary",
						heading: "Support",
						text: "Secondary",
					},
					{
						id: "visual",
						type: "image-placeholder",
						region: "media",
						alt: "Editorial visual",
						caption: "Image direction",
					},
				]),
			);

			expect(view.container.querySelector(`[data-layout="${layout}"]`)).toBeInTheDocument();
			view.unmount();
		}
	});

	it("surfaces labels and hierarchy metadata for treatments and emphasis", () => {
		const { container, getByText } = renderSlide(
			contentSlide(
				"comparison",
				[
					{
						id: "hero-stat",
						type: "stats",
						region: "primary",
						emphasis: "hero",
						treatment: "accent",
						items: [{ value: "42%", label: "Lift" }],
					},
					{
						type: "bullets",
						region: "secondary",
						emphasis: "supporting",
						treatment: "outline",
						ordered: false,
						items: ["Measured outcome"],
					},
				],
				{ eyebrow: "Field note", regionLabels: { primary: "Now", secondary: "Next" } },
			),
		);

		expect(getByText("Field note")).toBeInTheDocument();
		expect(getByText("Now")).toBeInTheDocument();
		expect(getByText("Next")).toBeInTheDocument();
		expect(container.querySelector('[data-emphasis="hero"]')).toHaveAttribute(
			"data-treatment",
			"accent",
		);
		expect(container.querySelector('[data-emphasis="supporting"]')).toHaveAttribute(
			"data-treatment",
			"outline",
		);
	});

	it("uses placeholders for unsafe image URLs and rejects unsafe backgrounds", () => {
		const { container, getByRole } = renderSlide(
			contentSlide(
				"media-left",
				[
					{
						type: "image",
						region: "media",
						url: "javascript:alert(1)",
						alt: "Product workflow",
						caption: "Add the final capture",
					},
				],
				{
					backgroundImage: {
						url: "data:image/svg+xml,<svg onload=alert(1) />",
						alt: "Unsafe background",
						focalPoint: "center",
						overlay: "strong",
					},
				},
			),
		);

		expect(getByRole("img", { name: "Product workflow" })).toBeInTheDocument();
		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector(".ss-editorial-background")).toBeNull();
	});

	it("applies safe backgrounds, focal points, overlays, tone, density, and patterns", () => {
		const { container } = renderSlide(
			contentSlide("cover", [{ type: "paragraph", region: "main", text: "Cover note" }], {
				tone: "inverse",
				density: "airy",
				pattern: "diagonal",
				backgroundImage: {
					url: "https://images.example.com/cover.jpg",
					alt: "Mountain landscape",
					focalPoint: "top",
					overlay: "medium",
				},
			}),
		);

		const slide = container.querySelector(".ss-editorial-slide");
		const background = container.querySelector<HTMLElement>(".ss-editorial-background");
		expect(slide).toHaveClass("ss-tone-inverse", "ss-density-airy", "ss-pattern-diagonal");
		expect(background).toHaveAttribute("data-overlay", "medium");
		expect(background).toHaveAttribute("aria-label", "Mountain landscape");
		expect(background?.style.backgroundPosition).toBe("center top");
		expect(background?.style.backgroundImage).toContain("https://images.example.com/cover.jpg");
	});

	it("promotes cover support visuals into a faded full-slide background", () => {
		const { container } = renderSlide(
			contentSlide("cover", [
				{ id: "copy", type: "paragraph", region: "main", text: "Cover note" },
				{
					id: "support-visual",
					type: "image",
					region: "media",
					url: "https://images.example.com/support.jpg",
					alt: "Supporting landscape",
					caption: "",
					focalPoint: "top",
				},
			]),
		);
		const background = container.querySelector<HTMLElement>(".ss-editorial-background");
		expect(background).toHaveAttribute("data-overlay", "strong");
		expect(background?.style.backgroundPosition).toBe("center top");
		expect(background?.parentElement).toHaveClass("ss-editorial-frame");
		expect(container.querySelector('[data-edit-block-id="support-visual"]')).toBeNull();
	});

	it("keeps missing media backgrounds transparent without showing their descriptions", () => {
		for (const layout of ["media-left", "media-right"] as const) {
			const view = renderSlide(
				contentSlide(layout, [
					{ id: "copy", type: "paragraph", region: "primary", text: "Split copy" },
					{
						id: "support-visual",
						type: "image-placeholder",
						region: "media",
						alt: "Split support",
						caption: "",
					},
				]),
			);
			expect(view.container.querySelector(".ss-editorial-background")).toBeNull();
			expect(view.queryByText("Split support")).toBeNull();
			expect(view.container.querySelector('[data-region="media"]')).toBeEmptyDOMElement();
			view.unmount();
		}
	});

	it("renders final statistic values in inactive previews", () => {
		const { getByText } = renderSlide(
			contentSlide("spotlight", [
				{
					id: "metric",
					type: "stats",
					region: "primary",
					items: [{ value: "$12.5M", label: "Revenue" }],
				},
			]),
			false,
		);
		expect(getByText("$12.5M")).toBeInTheDocument();
	});

	it("renders generated widget labels as accessible plain SVG text", () => {
		const slide = contentSlide("body", [
			{
				type: "widget",
				region: "main",
				version: 1,
				kind: "architecture",
				direction: "horizontal",
				nodes: [
					{
						id: "gateway",
						role: "system",
						tone: "neutral",
						label: "<img src=x onerror=alert(1)>",
						description: "Routes requests safely",
						value: "",
						parentId: "",
					},
					{
						id: "worker",
						role: "system",
						tone: "neutral",
						label: "Worker",
						description: "",
						value: "",
						parentId: "gateway",
					},
				],
				edges: [{ from: "gateway", to: "worker", label: "queues" }],
			},
		]);
		const { container, getByRole } = renderSlide(slide);

		expect(getByRole("img", { name: "architecture widget with 2 items" })).toBeInTheDocument();
		expect(container.querySelector("svg")?.textContent).toContain("<img src=x");
		expect(container.querySelector("svg img")).toBeNull();
		expect(container.querySelectorAll("[data-widget-node]")).toHaveLength(2);
	});

	it("renders embedded chart blocks as themed figures beside explanatory text", () => {
		const { container, getByText } = renderSlide(
			contentSlide("split", [
				{
					type: "bullets",
					region: "primary",
					ordered: false,
					items: ["Adoption doubled in a year"],
				},
				{
					id: "evidence-chart",
					type: "chart",
					region: "secondary",
					scale: "inline",
					chartConfig: {
						type: "bar",
						title: "Adoption by quarter",
						description: "New teams per quarter",
						data: { labels: ["Q1", "Q2"], datasets: [{ label: "Teams", data: [12, 24] }] },
					},
				},
			]),
		);

		const figure = container.querySelector("figure.ss-chart-block");
		expect(figure).toHaveClass("ss-chart--inline");
		expect(figure?.querySelector("canvas")).not.toBeNull();
		expect(getByText("Adoption by quarter")).toBeInTheDocument();
		expect(getByText("New teams per quarter")).toBeInTheDocument();
		expect(
			container.querySelector('[data-region="secondary"] .ss-chart-caption'),
		).toBeInTheDocument();
	});

	it("derives panel scale for media-region charts and keeps them out of backgrounds", () => {
		const { container } = renderSlide(
			contentSlide("media-right", [
				{ type: "paragraph", region: "primary", text: "The numbers explain themselves." },
				{
					id: "panel-chart",
					type: "chart",
					region: "media",
					chartConfig: {
						type: "doughnut",
						data: { labels: ["A", "B"], datasets: [{ data: [60, 40] }] },
					},
				},
			]),
		);

		expect(container.querySelector(".ss-editorial-background")).toBeNull();
		expect(container.querySelector('[data-region="media"] figure.ss-chart-block')).toHaveClass(
			"ss-chart--panel",
		);
	});
});
