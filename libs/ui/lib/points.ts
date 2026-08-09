export const POINTS_UPDATED_EVENT = "slidesage:points-updated";
const POINTS_STORAGE_KEY = "slidesage:points-updated";

export function publishPointsBalance(slideTokens: unknown) {
	if (
		typeof window === "undefined" ||
		typeof slideTokens !== "number" ||
		!Number.isFinite(slideTokens)
	) {
		return;
	}
	window.dispatchEvent(new CustomEvent(POINTS_UPDATED_EVENT, { detail: { slideTokens } }));
	try {
		window.localStorage.setItem(
			POINTS_STORAGE_KEY,
			JSON.stringify({ slideTokens, updatedAt: Date.now() }),
		);
	} catch {
		// Storage can be unavailable in private browsing; the current tab still updates.
	}
}

export function readPointBalanceStorage(value: string | null): number | null {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as { slideTokens?: unknown };
		return typeof parsed.slideTokens === "number" && Number.isFinite(parsed.slideTokens)
			? parsed.slideTokens
			: null;
	} catch {
		return null;
	}
}
