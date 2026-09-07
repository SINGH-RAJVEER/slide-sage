import { API_URL } from "./api";

/**
 * Fetches the bytes of a presentation's current revision.
 *
 * A presentation is its PPTX revision, so this is both what the viewer renders
 * and what Download saves; there is no second representation to keep in step.
 * The endpoint is served by the API rather than the CDN because revisions are
 * private to their owner.
 */
export async function fetchPresentationRevision(
	presentationId: string,
	signal?: AbortSignal,
	revision?: number,
	format: "pptx" | "pdf" = "pptx",
): Promise<ArrayBuffer> {
	const path =
		format === "pdf"
			? `revisions/${revision}/pdf`
			: `revision${revision ? `?revision=${revision}` : ""}`;
	const response = await fetch(`${API_URL}/presentations/${presentationId}/${path}`, {
		credentials: "include",
		signal,
	});
	if (!response.ok) {
		throw new Error(`Could not load presentation revision (${response.status})`);
	}
	return response.arrayBuffer();
}
