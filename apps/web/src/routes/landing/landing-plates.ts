import { MARKETPLACE_ITEMS } from "@slidesage/ui/lib/catalog";
import { templateThumbnailUrl } from "@slidesage/ui/lib/template-thumbnails";

/**
 * A plate orbiting the wordmark. Each one is a real published template, shown
 * through the cover thumbnail the CDN already serves for the marketplace, so
 * the landing page ships no slide fixtures of its own.
 */
export interface LandingPlate {
	id: string;
	name: string;
	thumbnailUrl: string;
}

export const LANDING_PLATE_COUNT = 8;

/**
 * Templates the ring can show: published, and wide enough that a 16:9 plate
 * does not letterbox. An unpublished template has no thumbnail behind it.
 */
function ringTemplates() {
	return MARKETPLACE_ITEMS.filter((item) => item.available && item.aspectRatio.label === "16:9");
}

/**
 * Picks the plates for one visit.
 *
 * The ring is a sample rather than a fixed set, so the landing page looks
 * different between visits and no single template becomes its face. `random`
 * is injectable so tests can pin the selection.
 */
export function randomLandingPlates(
	count: number = LANDING_PLATE_COUNT,
	random: () => number = Math.random,
): LandingPlate[] {
	const pool = ringTemplates();
	for (let index = pool.length - 1; index > 0; index -= 1) {
		const swap = Math.floor(random() * (index + 1));
		const held = pool[index];
		const other = pool[swap];
		if (held && other) {
			pool[index] = other;
			pool[swap] = held;
		}
	}
	return pool.slice(0, Math.min(count, pool.length)).map((item) => ({
		id: item.id,
		name: item.name,
		thumbnailUrl: templateThumbnailUrl(item.thumbnailPath),
	}));
}
