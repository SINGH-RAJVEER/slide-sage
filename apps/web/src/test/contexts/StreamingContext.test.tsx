/// <reference lib="dom" />

import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import {
	PRESENTATIONS_UPDATED_EVENT,
	type PresentationUpdatedDetail,
} from "@/lib/presentation-events";
import { StreamingProvider, useStreaming } from "@/modules/contexts/StreamingContext";

beforeEach(() => {
	localStorage.removeItem("slidesage-active-generation");
});

afterEach(() => {
	localStorage.removeItem("slidesage-active-generation");
});

function StreamingStarter({ onNavigateAway }: { onNavigateAway: () => void }) {
	const { startStreaming, streamingState } = useStreaming();

	return (
		<div>
			<span>{streamingState.isStreaming ? "streaming" : "idle"}</span>
			<output data-testid="generation-state">
				{streamingState.isComplete ? "complete" : "pending"}:{streamingState.error ?? "no-error"}
			</output>
			<button
				type="button"
				onClick={() => {
					void startStreaming(
						"Background generation",
						2,
						"balanced",
						"professional",
						false,
						undefined,
						"failed_presentation",
					);
				}}
			>
				Start
			</button>
			<button type="button" onClick={onNavigateAway}>
				Navigate away
			</button>
		</div>
	);
}

function IterationStarter() {
	const { startIterating, streamingState } = useStreaming();

	return (
		<div>
			<output data-testid="iteration-state">
				{streamingState.isStreaming ? "streaming" : "idle"}:
				{streamingState.isComplete ? "complete" : "pending"}:{streamingState.error ?? "no-error"}
			</output>
			<button
				type="button"
				onClick={() => {
					void startIterating(
						"Update this presentation",
						"presentation_1",
						2,
						"balanced",
						"professional",
					);
				}}
			>
				Iterate
			</button>
		</div>
	);
}

function AwayPage() {
	const { streamingState } = useStreaming();

	return (
		<span>
			{streamingState.isStreaming ? "streaming" : "stopped"}:
			{streamingState.isComplete ? "complete" : "pending"}:{streamingState.slides.length}:
			{streamingState.presentationId ?? "none"}:{streamingState.generationStage ?? "none"}
		</span>
	);
}

function NavigationHarness() {
	const [away, setAway] = useState(false);
	return away ? <AwayPage /> : <StreamingStarter onNavigateAway={() => setAway(true)} />;
}

it("continues processing and publishes the saved deck after the initiating page unmounts", async () => {
	const originalFetch = globalThis.fetch;
	const encoder = new TextEncoder();
	let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
	let requestBody = "";
	const presentationUpdated = mock((_event: Event) => {});

	window.addEventListener(PRESENTATIONS_UPDATED_EVENT, presentationUpdated);
	globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
		requestBody = String(init?.body ?? "");
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				streamController = controller;
			},
		});
		return new Response(body, {
			status: 200,
			headers: { "Content-Type": "text/event-stream" },
		});
	}) as unknown as typeof fetch;

	try {
		const view = render(
			<StreamingProvider>
				<NavigationHarness />
			</StreamingProvider>,
		);

		fireEvent.click(view.getByRole("button", { name: "Start" }));
		await waitFor(() => expect(view.getByText("streaming")).toBeInTheDocument());
		expect(JSON.parse(requestBody)).toMatchObject({
			retry_presentation_id: "failed_presentation",
			theme: "corporate-blue",
		});
		fireEvent.click(view.getByRole("button", { name: "Navigate away" }));

		await act(async () => {
			streamController?.enqueue(
				encoder.encode(
					'event: created\ndata: {"presentation_id":"presentation_1"}\n\n' +
						'event: stage\ndata: {"stage":"planning","message":"Preparing presentation","completed":1,"total":4}\n\n' +
						'event: outline\ndata: {"title":"Background deck","audience":"Leaders","thesis":"A thesis","cards":[]}\n\n' +
						'event: slide\ndata: {"slide":{"id":"slide_draft","type":"content","content":{}},"index":0,"title":"Background deck"}\n\n' +
						'event: slide\ndata: {"slide":{"id":"slide_1","type":"content","content":{}},"index":0,"title":"Background deck"}\n\n' +
						'event: complete\ndata: {"title":"Background deck","slides":[{"id":"slide_1","type":"content","content":{}}],"totalSlides":1}\n\n' +
						'event: saved\ndata: {"presentation_id":"presentation_1"}\n\n',
				),
			);
			streamController?.close();
		});

		await waitFor(() => {
			expect(view.getByText("stopped:complete:1:presentation_1:planning")).toBeInTheDocument();
		});
		expect(presentationUpdated).toHaveBeenCalledTimes(1);
		const event = presentationUpdated.mock.calls[0]?.[0] as CustomEvent<PresentationUpdatedDetail>;
		expect(event.detail.presentationId).toBe("presentation_1");
	} finally {
		window.removeEventListener(PRESENTATIONS_UPDATED_EVENT, presentationUpdated);
		globalThis.fetch = originalFetch;
	}
});

it("keeps generation incomplete when the stream ends before saved", async () => {
	const originalFetch = globalThis.fetch;
	const encoder = new TextEncoder();
	let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
	let requestCount = 0;

	globalThis.fetch = mock(async () => {
		requestCount++;
		if (requestCount > 1) {
			return Response.json({ error: { message: "Not ready" } }, { status: 404 });
		}
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				streamController = controller;
			},
		});
		return new Response(body, {
			status: 200,
			headers: { "Content-Type": "text/event-stream" },
		});
	}) as unknown as typeof fetch;

	try {
		const view = render(
			<StreamingProvider>
				<StreamingStarter onNavigateAway={() => {}} />
			</StreamingProvider>,
		);

		fireEvent.click(view.getByRole("button", { name: "Start" }));
		await act(async () => {
			streamController?.enqueue(
				encoder.encode(
					'event: complete\ndata: {"title":"Unsaved deck","slides":[],"totalSlides":0}\n\n',
				),
			);
			streamController?.close();
		});

		await waitFor(() => {
			expect(view.getByTestId("generation-state")).toHaveTextContent(
				"pending:Generation stream ended before the presentation was completed.",
			);
		});
	} finally {
		globalThis.fetch = originalFetch;
	}
});

it("treats saved as terminal when a later frame follows it", async () => {
	const originalFetch = globalThis.fetch;
	const encoder = new TextEncoder();
	let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

	globalThis.fetch = mock(async () => {
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				streamController = controller;
			},
		});
		return new Response(body, {
			status: 200,
			headers: { "Content-Type": "text/event-stream" },
		});
	}) as unknown as typeof fetch;

	try {
		const view = render(
			<StreamingProvider>
				<IterationStarter />
			</StreamingProvider>,
		);

		fireEvent.click(view.getByRole("button", { name: "Iterate" }));
		await act(async () => {
			streamController?.enqueue(
				encoder.encode(
					'event: complete\ndata: {"title":"Updated deck","slides":[],"totalSlides":0}\n\n' +
						'event: saved\ndata: {"presentation_id":"presentation_1"}\n\n' +
						'event: error\ndata: {"error":"Save confirmation was revoked"}\n\n',
				),
			);
			streamController?.close();
		});

		await waitFor(() => {
			expect(view.getByTestId("iteration-state")).toHaveTextContent("idle:complete:no-error");
		});
	} finally {
		globalThis.fetch = originalFetch;
	}
});

it("replays a durable generation stream after the provider remounts", async () => {
	const originalFetch = globalThis.fetch;
	localStorage.setItem(
		"slidesage-active-generation",
		JSON.stringify({
			jobId: "job_1",
			presentationId: "presentation_1",
			operation: "generation",
			prompt: "Reconnect this deck",
			requestedSlides: 1,
			theme: "corporate-blue",
			lastEventId: 1,
		}),
	);
	let requestedURL = "";
	globalThis.fetch = mock(async (input: RequestInfo | URL) => {
		requestedURL = String(input);
		return new Response(
			'id: 2\nevent: stage\ndata: {"stage":"drafting","message":"Writing slide content","completed":2,"total":3}\n\n' +
				'id: 3\nevent: complete\ndata: {"title":"Reconnected","theme":"corporate-blue","slides":[{"id":"slide_1","type":"content","blocks":[]}],"totalSlides":1}\n\n' +
				'id: 4\nevent: saved\ndata: {"presentation_id":"presentation_1"}\n\n',
			{ status: 200, headers: { "Content-Type": "text/event-stream" } },
		);
	}) as unknown as typeof fetch;

	try {
		const view = render(
			<StreamingProvider>
				<AwayPage />
			</StreamingProvider>,
		);
		await waitFor(() => {
			expect(view.getByText("stopped:complete:1:presentation_1:drafting")).toBeInTheDocument();
		});
		expect(requestedURL).toContain("/generation-jobs/job_1/events?after=0");
		expect(localStorage.getItem("slidesage-active-generation")).toBeNull();
	} finally {
		localStorage.removeItem("slidesage-active-generation");
		globalThis.fetch = originalFetch;
	}
});

it("reconnects when the initial response ends after exposing the job id", async () => {
	const originalFetch = globalThis.fetch;
	let requestCount = 0;
	let replayURL = "";
	globalThis.fetch = mock(async (input: RequestInfo | URL) => {
		requestCount++;
		if (requestCount === 1) {
			return new Response("", {
				status: 200,
				headers: {
					"Content-Type": "text/event-stream",
					"X-Generation-Job-ID": "job_from_header",
					"X-Presentation-ID": "presentation_from_header",
				},
			});
		}
		replayURL = String(input);
		return new Response(
			'id: 1\nevent: complete\ndata: {"title":"Recovered","theme":"corporate-blue","slides":[{"id":"slide_1","type":"content","blocks":[]}]}\n\n' +
				'id: 2\nevent: saved\ndata: {"presentation_id":"presentation_from_header"}\n\n',
			{ status: 200, headers: { "Content-Type": "text/event-stream" } },
		);
	}) as unknown as typeof fetch;

	try {
		const view = render(
			<StreamingProvider>
				<StreamingStarter onNavigateAway={() => {}} />
			</StreamingProvider>,
		);
		fireEvent.click(view.getByRole("button", { name: "Start" }));
		await waitFor(() => {
			expect(view.getByTestId("generation-state")).toHaveTextContent("complete:no-error");
		});
		expect(replayURL).toContain("/generation-jobs/job_from_header/events?after=0");
		expect(localStorage.getItem("slidesage-active-generation")).toBeNull();
	} finally {
		localStorage.removeItem("slidesage-active-generation");
		globalThis.fetch = originalFetch;
	}
});

it("clears a stored job that is no longer available", async () => {
	const originalFetch = globalThis.fetch;
	localStorage.setItem(
		"slidesage-active-generation",
		JSON.stringify({
			jobId: "expired_job",
			presentationId: "expired_presentation",
			operation: "generation",
			requestedSlides: 1,
			theme: "corporate-blue",
			lastEventId: 0,
		}),
	);
	globalThis.fetch = mock(async () =>
		Response.json({}, { status: 404 }),
	) as unknown as typeof fetch;

	try {
		const view = render(
			<StreamingProvider>
				<StreamingStarter onNavigateAway={() => {}} />
			</StreamingProvider>,
		);
		await waitFor(() => {
			expect(view.getByTestId("generation-state")).toHaveTextContent(
				"pending:The saved generation job is no longer available.",
			);
		});
		expect(localStorage.getItem("slidesage-active-generation")).toBeNull();
	} finally {
		localStorage.removeItem("slidesage-active-generation");
		globalThis.fetch = originalFetch;
	}
});

it("discovers a committed job when the POST fails before response headers", async () => {
	const originalFetch = globalThis.fetch;
	let requestCount = 0;
	let lookupURL = "";
	globalThis.fetch = mock(async (input: RequestInfo | URL) => {
		requestCount++;
		if (requestCount === 1) throw new TypeError("Connection closed before headers");
		if (String(input).includes("/idempotency/")) {
			lookupURL = String(input);
			return Response.json({
				id: "discovered_job",
				presentation_id: "discovered_presentation",
			});
		}
		return new Response(
			'id: 1\nevent: complete\ndata: {"title":"Discovered","theme":"corporate-blue","slides":[{"id":"slide_1","type":"content","blocks":[]}]}\n\n' +
				'id: 2\nevent: saved\ndata: {"presentation_id":"discovered_presentation"}\n\n',
			{ status: 200, headers: { "Content-Type": "text/event-stream" } },
		);
	}) as unknown as typeof fetch;

	try {
		const view = render(
			<StreamingProvider>
				<StreamingStarter onNavigateAway={() => {}} />
			</StreamingProvider>,
		);
		fireEvent.click(view.getByRole("button", { name: "Start" }));
		await waitFor(() => {
			expect(view.getByTestId("generation-state")).toHaveTextContent("complete:no-error");
		});
		expect(lookupURL).toContain("/generation-jobs/idempotency/");
		expect(lookupURL).toContain("/job?kind=generation");
		expect(lookupURL).toContain("?kind=generation");
		expect(requestCount).toBe(3);
	} finally {
		localStorage.removeItem("slidesage-active-generation");
		globalThis.fetch = originalFetch;
	}
});

it("discovers a committed job after an ambiguous gateway failure", async () => {
	const originalFetch = globalThis.fetch;
	let requestCount = 0;
	globalThis.fetch = mock(async (input: RequestInfo | URL) => {
		requestCount++;
		if (requestCount === 1) return new Response("Bad gateway", { status: 502 });
		if (String(input).includes("/idempotency/")) {
			return Response.json({ id: "gateway_job", presentation_id: "gateway_presentation" });
		}
		return new Response(
			'id: 1\nevent: complete\ndata: {"title":"Gateway recovery","theme":"corporate-blue","slides":[{"id":"slide_1","type":"content","blocks":[]}]}\n\n' +
				'id: 2\nevent: saved\ndata: {"presentation_id":"gateway_presentation"}\n\n',
			{ status: 200, headers: { "Content-Type": "text/event-stream" } },
		);
	}) as unknown as typeof fetch;

	try {
		const view = render(
			<StreamingProvider>
				<StreamingStarter onNavigateAway={() => {}} />
			</StreamingProvider>,
		);
		fireEvent.click(view.getByRole("button", { name: "Start" }));
		await waitFor(() => {
			expect(view.getByTestId("generation-state")).toHaveTextContent("complete:no-error");
		});
		expect(requestCount).toBe(3);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

it("keeps replay recovery durable until a saved-only deck can be loaded", async () => {
	const originalFetch = globalThis.fetch;
	localStorage.setItem(
		"slidesage-active-generation",
		JSON.stringify({
			jobId: "saved_job",
			presentationId: "saved_presentation",
			operation: "generation",
			requestedSlides: 1,
			theme: "corporate-blue",
			lastEventId: 5,
		}),
	);
	let presentationRequests = 0;
	globalThis.fetch = mock(async (input: RequestInfo | URL) => {
		if (String(input).includes("/presentations/")) {
			presentationRequests++;
			if (presentationRequests === 1) return Response.json({}, { status: 503 });
			return Response.json({
				presentation: {
					slides_data: {
						status: "ready",
						title: "Recovered saved deck",
						theme: "corporate-blue",
						slides: [{ id: "slide_saved", type: "content", blocks: [] }],
					},
				},
			});
		}
		return new Response('id: 6\nevent: saved\ndata: {"presentation_id":"saved_presentation"}\n\n', {
			status: 200,
			headers: { "Content-Type": "text/event-stream" },
		});
	}) as unknown as typeof fetch;

	try {
		const view = render(
			<StreamingProvider>
				<AwayPage />
			</StreamingProvider>,
		);
		await waitFor(
			() => {
				expect(view.getByText("stopped:complete:1:saved_presentation:none")).toBeInTheDocument();
			},
			{ timeout: 3000 },
		);
		expect(presentationRequests).toBe(2);
		expect(localStorage.getItem("slidesage-active-generation")).toBeNull();
	} finally {
		localStorage.removeItem("slidesage-active-generation");
		globalThis.fetch = originalFetch;
	}
});
