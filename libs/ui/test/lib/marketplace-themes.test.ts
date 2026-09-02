import { beforeEach, describe, expect, it } from "bun:test";
import { MARKETPLACE_ITEMS } from "@slidesage/ui/lib/catalog";
import {
	getInstalledMarketplaceThemes,
	installMarketplaceTheme,
	removeMarketplaceTheme,
} from "@slidesage/ui/lib/marketplace-themes";

const STORAGE_KEY = "slidesage-installed-marketplace-themes";

describe("installed marketplace templates", () => {
	beforeEach(() => localStorage.clear());

	it("stores and returns versioned binary template references", () => {
		const item = MARKETPLACE_ITEMS[0];
		if (!item) throw new Error("Expected a marketplace template");

		expect(installMarketplaceTheme(item.id)).toBe(true);
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")).toEqual([item.templateReference]);
		expect(getInstalledMarketplaceThemes()).toEqual([
			{
				marketplaceId: item.id,
				name: item.name,
				description: item.description,
				templateReference: item.templateReference,
				previewThemeId: item.previewThemeId,
				themeId: item.previewThemeId,
			},
		]);
	});

	it("upgrades matching string IDs and drops unrelated synthetic IDs", () => {
		const item = MARKETPLACE_ITEMS[0];
		if (!item) throw new Error("Expected a marketplace template");
		localStorage.setItem(STORAGE_KEY, JSON.stringify([item.id, "neon-district", item.id]));

		expect(getInstalledMarketplaceThemes().map((theme) => theme.marketplaceId)).toEqual([item.id]);
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")).toEqual([item.templateReference]);
	});

	it("removes a stored binary template reference", () => {
		const item = MARKETPLACE_ITEMS[0];
		if (!item) throw new Error("Expected a marketplace template");
		localStorage.setItem(STORAGE_KEY, JSON.stringify([item.templateReference]));

		expect(removeMarketplaceTheme(item.id)).toBe(true);
		expect(localStorage.getItem(STORAGE_KEY)).toBe("[]");
	});
});
