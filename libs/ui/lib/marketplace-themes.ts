import type { ThemeId } from "@slidesage/types";
import { MARKETPLACE_ITEMS } from "./catalog";

const STORAGE_KEY = "slidesage-installed-marketplace-themes";
export const MARKETPLACE_THEMES_UPDATED_EVENT = "slidesage:marketplace-themes-updated";

export interface InstalledMarketplaceTheme {
	marketplaceId: string;
	name: string;
	description: string;
	themeId: ThemeId;
}

export function getInstalledMarketplaceThemes(): InstalledMarketplaceTheme[] {
	if (typeof window === "undefined") return [];

	try {
		const installedIds = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
		if (!Array.isArray(installedIds)) return [];

		const uniqueIds = new Set(installedIds.filter((id): id is string => typeof id === "string"));
		return MARKETPLACE_ITEMS.filter((item) => uniqueIds.has(item.id)).map((item) => ({
			marketplaceId: item.id,
			name: item.name,
			description: item.description,
			themeId: item.themeId,
		}));
	} catch {
		return [];
	}
}

export function installMarketplaceTheme(marketplaceId: string) {
	const item = MARKETPLACE_ITEMS.find((candidate) => candidate.id === marketplaceId);
	if (!item || typeof window === "undefined") return false;

	const installedIds = getInstalledMarketplaceThemes().map((theme) => theme.marketplaceId);
	if (!installedIds.includes(marketplaceId)) {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...installedIds, marketplaceId]));
		window.dispatchEvent(new Event(MARKETPLACE_THEMES_UPDATED_EVENT));
	}
	return true;
}

export function removeMarketplaceTheme(marketplaceId: string) {
	if (typeof window === "undefined") return false;

	const installedIds = getInstalledMarketplaceThemes().map((theme) => theme.marketplaceId);
	if (!installedIds.includes(marketplaceId)) return false;

	window.localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify(installedIds.filter((id) => id !== marketplaceId)),
	);
	window.dispatchEvent(new Event(MARKETPLACE_THEMES_UPDATED_EVENT));
	return true;
}

export function isMarketplaceThemeInstalled(marketplaceId: string) {
	return getInstalledMarketplaceThemes().some((theme) => theme.marketplaceId === marketplaceId);
}
