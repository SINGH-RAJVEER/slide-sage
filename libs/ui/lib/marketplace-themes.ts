import type { PresentationTemplateReference, ThemeId } from "@slidesage/types";
import { MARKETPLACE_ITEMS } from "./catalog";

const STORAGE_KEY = "slidesage-installed-marketplace-themes";
export const MARKETPLACE_THEMES_UPDATED_EVENT = "slidesage:marketplace-themes-updated";

export interface InstalledMarketplaceTheme {
	marketplaceId: string;
	name: string;
	description: string;
	templateReference: PresentationTemplateReference;
	previewThemeId: ThemeId;
	themeId: ThemeId;
}

function getStoredReferences(): PresentationTemplateReference[] {
	if (typeof window === "undefined") return [];

	try {
		const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
		if (!Array.isArray(stored)) return [];

		const references = stored.flatMap((value): PresentationTemplateReference[] => {
			const id = typeof value === "string" ? value : value?.id;
			const item = MARKETPLACE_ITEMS.find((candidate) => candidate.id === id);
			if (!item) return [];
			if (typeof value !== "string" && value.version !== item.templateReference.version) return [];
			return [item.templateReference];
		});
		const uniqueReferences = references.filter(
			(reference, index) =>
				references.findIndex((candidate) => candidate.id === reference.id) === index,
		);
		const serialized = JSON.stringify(uniqueReferences);
		if (window.localStorage.getItem(STORAGE_KEY) !== serialized) {
			window.localStorage.setItem(STORAGE_KEY, serialized);
		}
		return uniqueReferences;
	} catch {
		return [];
	}
}

export function getInstalledMarketplaceThemes(): InstalledMarketplaceTheme[] {
	const installedIds = new Set(getStoredReferences().map((reference) => reference.id));
	return MARKETPLACE_ITEMS.filter((item) => installedIds.has(item.id)).map((item) => ({
		marketplaceId: item.id,
		name: item.name,
		description: item.description,
		templateReference: item.templateReference,
		previewThemeId: item.previewThemeId,
		themeId: item.previewThemeId,
	}));
}

export function installMarketplaceTheme(marketplaceId: string) {
	const item = MARKETPLACE_ITEMS.find((candidate) => candidate.id === marketplaceId);
	if (!item || typeof window === "undefined") return false;

	const installedReferences = getStoredReferences();
	if (!installedReferences.some((reference) => reference.id === marketplaceId)) {
		window.localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify([...installedReferences, item.templateReference]),
		);
		window.dispatchEvent(new Event(MARKETPLACE_THEMES_UPDATED_EVENT));
	}
	return true;
}

export function removeMarketplaceTheme(marketplaceId: string) {
	if (typeof window === "undefined") return false;

	const installedReferences = getStoredReferences();
	if (!installedReferences.some((reference) => reference.id === marketplaceId)) return false;

	window.localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify(installedReferences.filter((reference) => reference.id !== marketplaceId)),
	);
	window.dispatchEvent(new Event(MARKETPLACE_THEMES_UPDATED_EVENT));
	return true;
}

export function isMarketplaceThemeInstalled(marketplaceId: string) {
	return getStoredReferences().some((reference) => reference.id === marketplaceId);
}
