import { describe, expect, it } from "bun:test";
import { createMarketplacePreviewPresentation, MARKETPLACE_ITEMS } from "@slidesage/ui/lib/catalog";
import {
	AVAILABLE_TEMPLATES,
	findTemplate,
	getTemplate,
	MARKETPLACE_TEMPLATES,
} from "@slidesage/ui/lib/templates";

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

	it("keeps marketplace systems entirely separate from the defaults", () => {
		const defaultIds = AVAILABLE_TEMPLATES.map((template) => template.id);
		const marketplaceIds = MARKETPLACE_TEMPLATES.map((template) => template.id);

		expect(MARKETPLACE_TEMPLATES).toHaveLength(6);
		expect(marketplaceIds.filter((id) => defaultIds.includes(id))).toHaveLength(0);

		const everySystem = [...AVAILABLE_TEMPLATES, ...MARKETPLACE_TEMPLATES];
		expect(new Set(everySystem.map((template) => template.visual.layout)).size).toBe(
			everySystem.length,
		);
		expect(new Set(everySystem.map((template) => template.visual.accent)).size).toBe(
			everySystem.length,
		);
		expect(new Set(everySystem.map((template) => template.visual.background)).size).toBe(
			everySystem.length,
		);
	});

	it("resolves an unknown theme to the SlideSage default system", () => {
		const fallback = getTemplate("unknown-theme");
		expect(fallback.id).toBe("corporate-blue");
		expect(fallback.visual.layout).toBe("signal-grid");
	});

	it("resolves installed marketplace themes through the same renderer contract", () => {
		for (const template of MARKETPLACE_TEMPLATES) {
			expect(findTemplate(template.id)?.id).toBe(template.id);
			expect(getTemplate(template.id).visual.chartColors.length).toBeGreaterThanOrEqual(5);
		}
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
