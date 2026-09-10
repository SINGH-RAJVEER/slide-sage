import { useEffect, useState } from "react";
import { API_URL } from "../lib/api";
import type { PreviewDocument } from "./useRevisionPreviews";

export function useTemplatePreviews(id: string, version: number, available: boolean) {
	const [document, setDocument] = useState<PreviewDocument | null>(null);
	const [error, setError] = useState<string>();
	const [attempt, setAttempt] = useState(0);
	useEffect(() => {
		setDocument(null);
		setError(undefined);
		if (!available) return;
		const controller = new AbortController();
		const base = `${API_URL}/template-previews/${encodeURIComponent(id)}/${version}`;
		void (async () => {
			try {
				const response = await fetch(base, { credentials: "include", signal: controller.signal });
				if (!response.ok) throw new Error("Could not load the template slides. Please try again.");
				const manifest = await response.json();
				if (
					!Number.isInteger(manifest.slideCount) ||
					manifest.slideCount < 1 ||
					manifest.slideCount > 200 ||
					typeof manifest.sha256 !== "string" ||
					!/^[a-f0-9]{64}$/.test(manifest.sha256)
				)
					throw new Error("The template preview is invalid.");
				if (!controller.signal.aborted)
					setDocument({
						slides: Array.from(
							{ length: manifest.slideCount },
							(_, index) => `${base}/${manifest.sha256}/${index}`,
						),
					});
			} catch (cause) {
				if (!controller.signal.aborted)
					setError(cause instanceof Error ? cause.message : "Could not load the template.");
			}
		})();
		return () => controller.abort();
	}, [id, version, available, attempt]);
	return {
		document,
		error,
		isLoading: available && !document && !error,
		retry: () => setAttempt((value) => value + 1),
	};
}
