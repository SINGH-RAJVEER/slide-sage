import type React from "react";
import { useEffect, useId, useRef, useState } from "react";
import {
	createEditor,
	type EditorSession,
	fetchEditorSession,
	loadDocumentServerApi,
} from "../../lib/office-editor";

interface OfficeEditorProps {
	presentationId: string;
	readOnly?: boolean;
	/** Called after the editor closes so the viewer can reload the revision. */
	onClose?: () => void;
	className?: string;
}

/**
 * Hosts the ONLYOFFICE editor for the current revision.
 *
 * Saves travel from the document server to the API, not through the browser, so
 * this component owns nothing but the iframe's lifetime.
 */
export const OfficeEditor: React.FC<OfficeEditorProps> = ({
	presentationId,
	readOnly = false,
	onClose,
	className = "",
}) => {
	const containerId = useId().replace(/[^a-zA-Z0-9-]/g, "");
	const editorRef = useRef<{ destroyEditor: () => void } | null>(null);
	const [session, setSession] = useState<EditorSession | null>(null);
	const [error, setError] = useState<string | undefined>(undefined);

	useEffect(() => {
		const controller = new AbortController();
		let active = true;
		setError(undefined);
		setSession(null);

		void (async () => {
			try {
				const opened = await fetchEditorSession(presentationId, {
					readOnly,
					signal: controller.signal,
				});
				await loadDocumentServerApi(opened.documentServerUrl);
				if (!active) return;
				editorRef.current = createEditor(containerId, opened);
				setSession(opened);
			} catch (cause) {
				if (!active || controller.signal.aborted) return;
				setError(cause instanceof Error ? cause.message : "Could not open the editor");
			}
		})();

		return () => {
			active = false;
			controller.abort();
			editorRef.current?.destroyEditor();
			editorRef.current = null;
			onClose?.();
		};
	}, [presentationId, readOnly, containerId, onClose]);

	if (error) {
		return (
			<div className={`flex items-center justify-center p-8 text-center text-sm ${className}`}>
				<p role="alert">{error}</p>
			</div>
		);
	}

	return (
		<div className={`relative h-full w-full ${className}`}>
			<div id={containerId} className="h-full w-full" />
			{!session && (
				<p className="absolute inset-0 flex items-center justify-center text-sm" aria-live="polite">
					Opening the editor
				</p>
			)}
		</div>
	);
};
