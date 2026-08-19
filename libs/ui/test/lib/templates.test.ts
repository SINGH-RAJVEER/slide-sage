import { describe, expect, it } from "bun:test";
import { createMarketplacePreviewPresentation, MARKETPLACE_ITEMS } from "@slidesage/ui/lib/catalog";
import { AVAILABLE_TEMPLATES, getTemplate } from "@slidesage/ui/lib/templates";

describe("presentation theme systems", () => {
	it("defines six visually distinct default systems", () => {
		expect(AVAILABLE_TEMPLATES).toHaveLength(6);
		expect(new Set(AVAILABLE_TEMPLATES.map((template) => template.visual.layout)).size).toBe(
			AVAILABLE_TEMPLATES.length,
		);
		expect(new Set(AVAILABLE_TEMPLATES.map((template) => template.visual.accent)).size).toBe(
			AVAILABLE_TEMPLATES.length,
		);
		expect(
			new Set(AVAILABLE_TEMPLATES.map((template) => template.visual.displayFont)).size,
		).toBeGreaterThan(2);
	});

	it("resolves an unknown theme to the SlideSage default system", () => {
		const fallback = getTemplate("unknown-theme");
		expect(fallback.id).toBe("corporate-blue");
		expect(fallback.visual.layout).toBe("signal-grid");
	});

	it("builds a complete, theme-colored preview deck for every marketplace offering", () => {
		for (const item of MARKETPLACE_ITEMS) {
			const presentation = createMarketplacePreviewPresentation(item);
			const theme = getTemplate(item.themeId).visual;

			expect(presentation.slides).toHaveLength(7);
			expect(presentation.slides[1]).toMatchObject({
				id: `${item.id}-preview-showcase`,
				title: item.previewSlide.title,
			});
			expect(presentation.slides[2]).toMatchObject({ id: `${item.id}-preview-story` });
			expect(presentation.slides[3]).toMatchObject({
				id: `${item.id}-preview-growth-chart`,
				chartConfig: {
					data: { datasets: [{ borderColor: theme.chartColors[0] }] },
				},
			});
		}
	});
});
