import { useEffect, useState } from "react";
import { loadPptxDocument, type PptxDocument } from "../lib/pptx-document";
import { fetchPresentationRevision } from "../lib/presentation-revision";

interface UsePptxRevisionResult {
	document: PptxDocument | null;
	isLoading: boolean;
	error?: string;
}

/**
 * Loads and parses the current PPTX revision of a presentation.
 *
 * The parsed document is shared by the carousel, the thumbnails, and fullscreen
 * playback, so a deck is fetched and parsed once per revision rather than once
 * per view. Re-fetching is keyed on the revision number: revisions are
 * immutable, so the same number always means the same bytes.
 */
export function usePptxRevision(
	presentationId: string | undefined,
	revision: number | undefined,
): UsePptxRevisionResult {
	const [document, setDocument] = useState<PptxDocument | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);

	useEffect(() => {
		if (!presentationId || !revision) {
			setDocument(null);
			setError(undefined);
			return;
		}
		const controller = new AbortController();
		let active = true;
		setIsLoading(true);
		setError(undefined);

		void (async () => {
			try {
				const bytes = await fetchPresentationRevision(presentationId, controller.signal);
				const parsed = await loadPptxDocument(bytes);
				if (!active) return;
				setDocument(parsed);
			} catch (cause) {
				if (!active || controller.signal.aborted) return;
				setDocument(null);
				setError(cause instanceof Error ? cause.message : "Could not load the presentation");
			} finally {
				if (active) setIsLoading(false);
			}
		})();

		return () => {
			active = false;
			controller.abort();
		};
	}, [presentationId, revision]);

	return { document, isLoading, error };
}
