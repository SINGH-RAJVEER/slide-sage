import { API_URL } from "./api";

export interface EditorSession {
	documentServerUrl: string;
	documentKey: string;
	revision: number;
	config: Record<string, unknown>;
}

interface DocEditorInstance {
	destroyEditor: () => void;
}

interface DocsAPI {
	DocEditor: new (
		containerId: string,
		config: Record<string, unknown>,
	) => DocEditorInstance;
}

declare global {
	interface Window {
		DocsAPI?: DocsAPI;
	}
}

/**
 * Requests a signed editor session for the current revision.
 *
 * The configuration is signed by the API and handed to ONLYOFFICE unchanged, so
 * the browser never chooses the document, the permissions, or the callback.
 */
export async function fetchEditorSession(
	presentationId: string,
	options: { readOnly?: boolean; signal?: AbortSignal } = {},
): Promise<EditorSession> {
	const query = options.readOnly ? "?mode=view" : "";
	const response = await fetch(`${API_URL}/presentations/${presentationId}/editor/session${query}`, {
		method: "POST",
		credentials: "include",
		signal: options.signal,
	});
	if (response.status === 409) {
		throw new Error("This presentation has no PowerPoint revision to edit yet.");
	}
	if (!response.ok) {
		throw new Error(`Could not open the editor (${response.status})`);
	}
	return (await response.json()) as EditorSession;
}

const scriptLoads = new Map<string, Promise<void>>();

/**
 * Loads the document server's editor API once per origin. The script defines a
 * single global, so concurrent callers share one load rather than racing.
 */
export function loadDocumentServerApi(documentServerUrl: string): Promise<void> {
	const source = `${documentServerUrl.replace(/\/+$/, "")}/web-apps/apps/api/documents/api.js`;
	const pending = scriptLoads.get(source);
	if (pending) return pending;

	const load = new Promise<void>((resolve, reject) => {
		if (window.DocsAPI) {
			resolve();
			return;
		}
		const script = document.createElement("script");
		script.src = source;
		script.async = true;
		script.onload = () => {
			if (window.DocsAPI) resolve();
			else reject(new Error("The document server did not load its editor API."));
		};
		script.onerror = () => reject(new Error("Could not reach the document server."));
		document.head.appendChild(script);
	});
	load.catch(() => scriptLoads.delete(source));
	scriptLoads.set(source, load);
	return load;
}

export function createEditor(containerId: string, session: EditorSession): DocEditorInstance {
	const api = window.DocsAPI;
	if (!api) throw new Error("The document server editor API is not loaded.");
	return new api.DocEditor(containerId, session.config);
}
