import type { PresentationRevision } from "@slidesage/types";
import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../lib/api";

export interface PreviewDocument {
	slides: string[];
}
export type RevisionStatus = PresentationRevision & { editorEnabled: boolean };

export function useRevisionPreviews(
	id: string | undefined,
	revisionNumber?: number,
	enabled = true,
	selectedRevision?: number,
) {
	const [revision, setRevision] = useState<RevisionStatus | null>(null);
	const [error, setError] = useState<string>();
	const [refresh, setRefresh] = useState(0);
	const reload = useCallback(() => setRefresh((value) => value + 1), []);
	useEffect(() => {
		setRevision(null);
		setError(undefined);
		if (!id || !enabled) return;
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout>;
		async function poll() {
			try {
				const response = await fetch(
					`${API_URL}/presentations/${id}/revision/status${selectedRevision ? `?revision=${selectedRevision}` : ""}`,
					{ credentials: "include", signal: controller.signal },
				);
				if (!response.ok)
					throw new Error(
						response.status === 409
							? "This presentation has no PPTX revision. Regenerate it to use the viewer and editor."
							: "Could not load revision status.",
					);
				const current: RevisionStatus = await response.json();
				if (controller.signal.aborted) return;
				setRevision(current);
				setError(undefined);
				// Editor final saves can arrive after the iframe closes. Keep observing the current pointer.
				timer = setTimeout(
					() => void poll(),
					current.previewStatus === "pending" || current.previewStatus === "rendering"
						? 2000
						: 10000,
				);
			} catch (cause) {
				if (controller.signal.aborted) return;
				setError(cause instanceof Error ? cause.message : "Could not load previews.");
				timer = setTimeout(() => void poll(), 10000);
			}
		}
		void poll();
		return () => {
			controller.abort();
			clearTimeout(timer);
		};
	}, [id, revisionNumber, enabled, refresh, selectedRevision]);
	const retry = async () => {
		if (!id || !revision) return;
		try {
			const response = await fetch(
				`${API_URL}/presentations/${id}/revisions/${revision.revision}/previews/retry`,
				{ method: "POST", credentials: "include" },
			);
			if (!response.ok) throw new Error("Could not schedule previews. Please try again.");
			reload();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not schedule previews.");
		}
	};
	const document: PreviewDocument | null =
		revision?.previewStatus === "ready"
			? {
					slides: Array.from(
						{ length: revision.previewCount },
						(_, index) =>
							`${API_URL}/presentations/${id}/revisions/${revision.revision}/previews/${index}`,
					),
				}
			: null;
	return {
		document,
		revision,
		error,
		reload,
		retry,
		isLoading: enabled && !!id && !revision && !error,
	};
}
