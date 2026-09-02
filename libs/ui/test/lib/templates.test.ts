import { describe, expect, it } from "bun:test";
import { BINARY_PPTX_TEMPLATE_CATALOG } from "@slidesage/types";
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

	it("derives marketplace offerings and semantic previews from the binary catalog", () => {
		const binaryEntries = BINARY_PPTX_TEMPLATE_CATALOG.filter(
			(entry) => entry.availability === "marketplace",
		);

		expect(MARKETPLACE_ITEMS).toHaveLength(25);
		expect(MARKETPLACE_ITEMS.map((item) => item.id)).toEqual(
			binaryEntries.map((entry) => entry.id),
		);
		for (const item of MARKETPLACE_ITEMS) {
			const presentation = createMarketplacePreviewPresentation(item);
			const binaryEntry = binaryEntries.find((entry) => entry.id === item.id);
			if (!binaryEntry) throw new Error(`Missing binary entry for ${item.id}`);

			expect(item).toMatchObject({
				name: binaryEntry.name,
				previewThemeId: binaryEntry.previewThemeId,
				templateReference: { id: binaryEntry.id, version: binaryEntry.version },
				sourceFilename: `${item.id}.pptx`,
			});
			expect(item).not.toHaveProperty("author");
			expect(item).not.toHaveProperty("votes");
			expect(item).not.toHaveProperty("uses");
			expect(presentation).toMatchObject({
				theme: binaryEntry.previewThemeId,
				template: { id: binaryEntry.id, version: binaryEntry.version },
				totalSlides: 4,
			});
			expect(presentation.slides[1]).toMatchObject({
				id: `${item.id}-preview-showcase`,
				title: item.previewSlide.title,
			});
			expect(presentation.slides[2]).toMatchObject({ id: `${item.id}-preview-source` });
			expect(presentation.slides[3]).toMatchObject({ id: `${item.id}-preview-dimensions` });
		}
	});
});
