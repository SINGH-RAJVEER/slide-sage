import { afterEach, describe, expect, it } from "bun:test";
import { fetchEditorSession } from "../../lib/office-editor";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function stubFetch(response: Response, calls: { url?: string; init?: RequestInit } = {}) {
	globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		calls.url = String(input);
		calls.init = init;
		return Promise.resolve(response);
	}) as typeof fetch;
}

describe("fetchEditorSession", () => {
	it("requests an edit session with the browser session cookie", async () => {
		const session = {
			documentServerUrl: "https://documents.example.test",
			documentKey: "presentation-1-7",
			revision: 7,
			config: { documentType: "slide" },
		};
		const calls: { url?: string; init?: RequestInit } = {};
		stubFetch(Response.json(session), calls);

		await expect(fetchEditorSession("presentation-1")).resolves.toEqual(session);
		expect(calls.url).toEndWith("/presentations/presentation-1/editor/session");
		expect(calls.init?.method).toBe("POST");
		expect(calls.init?.credentials).toBe("include");
	});

	it("asks for a read-only session when the viewer cannot edit", async () => {
		const calls: { url?: string } = {};
		stubFetch(
			Response.json({ documentServerUrl: "", documentKey: "", revision: 1, config: {} }),
			calls,
		);

		await fetchEditorSession("presentation-1", { readOnly: true });

		expect(calls.url).toEndWith("/presentations/presentation-1/editor/session?mode=view");
	});

	it("explains a presentation that has no PPTX revision", async () => {
		stubFetch(new Response("", { status: 409 }));

		await expect(fetchEditorSession("presentation-1")).rejects.toThrow(
			"This presentation has no PowerPoint revision to edit yet.",
		);
	});

	it("reports an unexpected API failure with its status", async () => {
		stubFetch(new Response("", { status: 500 }));

		await expect(fetchEditorSession("presentation-1")).rejects.toThrow("(500)");
	});
});
