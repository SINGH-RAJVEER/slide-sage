/// <reference lib="dom" />

import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
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

function GenerateStarter({ onNavigateAway }: { onNavigateAway?: () => void }) {
	const { generate, streamingState } = useStreaming();

	return (
		<div>
			<span>{streamingState.isStreaming ? "streaming" : "idle"}</span>
			<output data-testid="generation-state">
				{streamingState.isComplete ? "complete" : "pending"}:{streamingState.error ?? "no-error"}
			</output>
			<button
				type="button"
				onClick={() => {
					void generate({
						prompt: "Background generation",
						slideCount: 2,
						detailLevel: "balanced",
						tonality: "professional",
						retryPresentationId: "failed_presentation",
					});
				}}
			>
				Start
			</button>
			{onNavigateAway ? (
				<button type="button" onClick={onNavigateAway}>
					Navigate away
				</button>
			) : null}
		</div>
	);
}

function IterateStarter() {
	const { generate, streamingState } = useStreaming();

	return (
		<div>
			<output data-testid="iteration-state">
				{streamingState.isStreaming ? "streaming" : "idle"}:
				{streamingState.isComplete ? "complete" : "pending"}:{streamingState.error ?? "no-error"}
			</output>
			<button
				type="button"
				onClick={() => {
					void generate({
						prompt: "Update this presentation",
						slideCount: 2,
						detailLevel: "balanced",
						tonality: "professional",
						parentPresentationId: "presentation_1",
					});
				}}
			>
				Iterate
			</button>
		</div>
	);
}

function CancelStarter() {
	const { cancelGeneration, generate, streamingState } = useStreaming();

	return (
		<div>
			<output data-testid="cancel-state">
				{streamingState.isStreaming ? "streaming" : "idle"}:{streamingState.error ?? "no-error"}
			</output>
			<button
				type="button"
				onClick={() => {
					void generate({
						prompt: "Cancel this deck",
						slideCount: 2,
						detailLevel: "balanced",
						tonality: "professional",
					});
				}}
			>
				Start
			</button>
			<button type="button" onClick={() => void cancelGeneration()}>
				Cancel generation
			</button>
		</div>
	);
}

function AwayPage() {
	const { streamingState } = useStreaming();

	return (
		<span>
			{[
				streamingState.isStreaming ? "streaming" : "stopped",
				streamingState.isComplete ? "complete" : "pending",
				String(streamingState.slides.length),
				streamingState.presentationId ?? "none",
				streamingState.generationStage ?? "none",
				streamingState.error ?? "no-error",
			].join(":")}
		</span>
	);
}

function NavigationHarness() {
	const [away, setAway] = useState(false);
	return away ? <AwayPage /> : <GenerateStarter onNavigateAway={() => setAway(true)} />;
}

function sse(body: string) {
	return new Response(body, {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

function pendingSSE() {
	return new Response(new ReadableStream({ start() {} }), {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

it("submits a job and continues processing after the initiating page unmounts", async () => {
	const originalFetch = globalThis.fetch;
	let requestBody = "";
	let eventsRequested = false;
	const presentationUpdated = mock((_event: Event) => {});

	window.addEventListener(PRESENTATIONS_UPDATED_EVENT, presentationUpdated);
	globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.endsWith("/presentation-jobs")) {
			requestBody = String(init?.body ?? "");
			return Response.json(
				{ job_id: "job_1", presentation_id: "failed_presentation" },
				{
					status: 202,
				},
			);
		}
		eventsRequested = true;
		return sse(
			'id: 1\nevent: created\ndata: {"presentation_id":"presentation_1"}\n\n' +
				'id: 2\nevent: stage\ndata: {"stage":"planning","message":"Preparing presentation","completed":1,"total":4}\n\n' +
				'id: 3\nevent: outline\ndata: {"title":"Background deck","audience":"Leaders","thesis":"A thesis","cards":[]}\n\n' +
				'id: 4\nevent: slide\ndata: {"slide":{"id":"slide_draft","type":"content","content":{}},"index":0,"title":"Background deck"}\n\n' +
				'id: 5\nevent: slide\ndata: {"slide":{"id":"slide_1","type":"content","content":{}},"index":0,"title":"Background deck"}\n\n' +
				'id: 6\nevent: complete\ndata: {"title":"Background deck","slides":[{"id":"slide_1","type":"content","content":{}}],"totalSlides":1}\n\n' +
				'id: 7\nevent: saved\ndata: {"presentation_id":"presentation_1"}\n\n',
		);
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
		});
		expect(JSON.parse(requestBody)).not.toHaveProperty("theme");
		expect(typeof JSON.parse(requestBody).job_id).toBe("string");
		fireEvent.click(view.getByRole("button", { name: "Navigate away" }));

		await waitFor(() => {
			expect(
				view.getByText("stopped:complete:1:presentation_1:planning:no-error"),
			).toBeInTheDocument();
		});
		expect(eventsRequested).toBe(true);
		expect(presentationUpdated).toHaveBeenCalledTimes(1);
		const event = presentationUpdated.mock.calls[0]?.[0] as CustomEvent<PresentationUpdatedDetail>;
		expect(event.detail.presentationId).toBe("presentation_1");
	} finally {
		window.removeEventListener(PRESENTATIONS_UPDATED_EVENT, presentationUpdated);
		globalThis.fetch = originalFetch;
	}
});

it("cancels an active generation and clears its resumable state", async () => {
	const originalFetch = globalThis.fetch;
	const requests: Array<{ url: string; method?: string }> = [];
	globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		requests.push({ url, method: init?.method });
		if (url.endsWith("/presentation-jobs")) {
			return Response.json(
				{ job_id: "job_cancel", presentation_id: "presentation_cancel" },
				{ status: 202 },
			);
		}
		if (url.endsWith("/cancel")) {
			return Response.json({ status: "cancellation_requested" }, { status: 202 });
		}
		return pendingSSE();
	}) as unknown as typeof fetch;

	try {
		const view = render(
			<StreamingProvider>
				<CancelStarter />
			</StreamingProvider>,
		);

		fireEvent.click(view.getByRole("button", { name: "Start" }));
		await waitFor(() => expect(view.getByTestId("cancel-state")).toHaveTextContent("streaming"));
		fireEvent.click(view.getByRole("button", { name: "Cancel generation" }));

		await waitFor(() =>
			expect(view.getByTestId("cancel-state")).toHaveTextContent("idle:no-error"),
		);
		expect(
			requests.some((request) => request.url.endsWith("/cancel") && request.method === "POST"),
		).toBe(true);
		expect(localStorage.getItem("slidesage-active-generation")).toBeNull();
	} finally {
		globalThis.fetch = originalFetch;
	}
});

it("reconnects to the event log when the first stream ends before saved", async () => {
	const originalFetch = globalThis.fetch;
	const requests: string[] = [];

	globalThis.fetch = mock(async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.endsWith("/presentation-jobs")) {
			return Response.json(
				{ job_id: "job_1", presentation_id: "failed_presentation" },
				{
					status: 202,
				},
			);
		}
		requests.push(url);
		if (requests.length === 1) {
			// Stream ends after the document snapshot but before the save
			// confirmation, so the client must reconnect from its cursor.
			return sse(
				'id: 4\nevent: complete\ndata: {"title":"Unsaved deck","slides":[],"totalSlides":0}\n\n',
			);
		}
		return sse('id: 5\nevent: saved\ndata: {"presentation_id":"failed_presentation"}\n\n');
	}) as unknown as typeof fetch;

	try {
		const view = render(
			<StreamingProvider>
				<GenerateStarter />
			</StreamingProvider>,
		);

		fireEvent.click(view.getByRole("button", { name: "Start" }));
		await waitFor(
			() => {
				expect(view.getByTestId("generation-state")).toHaveTextContent("complete:no-error");
			},
			{ timeout: 4000 },
		);
		expect(requests.length).toBeGreaterThanOrEqual(2);
		expect(requests[0]).toContain("/events?after=0");
		expect(requests[0]).toMatch(/\/generation-jobs\/[^/]+\/events/);
		expect(requests[1]).toContain("/events?after=4");
	} finally {
		globalThis.fetch = originalFetch;
	}
});

it("treats saved as terminal when a later frame follows it", async () => {
	const originalFetch = globalThis.fetch;

	globalThis.fetch = mock(async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.endsWith("/presentation-jobs")) {
			return Response.json({ job_id: "job_2", presentation_id: "presentation_1" }, { status: 202 });
		}
		return sse(
			'id: 1\nevent: complete\ndata: {"title":"Updated deck","slides":[],"totalSlides":0}\n\n' +
				'id: 2\nevent: saved\ndata: {"presentation_id":"presentation_1"}\n\n' +
				'id: 3\nevent: error\ndata: {"error":"Save confirmation was revoked"}\n\n',
		);
	}) as unknown as typeof fetch;

	try {
		const view = render(
			<StreamingProvider>
				<IterateStarter />
			</StreamingProvider>,
		);

		fireEvent.click(view.getByRole("button", { name: "Iterate" }));
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
		return sse(
			'id: 2\nevent: stage\ndata: {"stage":"drafting","message":"Writing slide content","completed":2,"total":3}\n\n' +
				'id: 3\nevent: complete\ndata: {"title":"Reconnected","theme":"corporate-blue","slides":[{"id":"slide_1","type":"content","blocks":[]}],"totalSlides":1}\n\n' +
				'id: 4\nevent: saved\ndata: {"presentation_id":"presentation_1"}\n\n',
		);
	}) as unknown as typeof fetch;

	try {
		const view = render(
			<StreamingProvider>
				<AwayPage />
			</StreamingProvider>,
		);
		await waitFor(() => {
			expect(view.baseElement.textContent).toContain(
				"stopped:complete:1:presentation_1:drafting:no-error",
			);
		});
		expect(requestedURL).toContain("/generation-jobs/job_1/events?after=1");
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
				<AwayPage />
			</StreamingProvider>,
		);
		await waitFor(() => {
			expect(view.baseElement.textContent).toContain(
				"stopped:pending:0:expired_presentation:none:The generation job is no longer available.",
			);
		});
		expect(localStorage.getItem("slidesage-active-generation")).toBeNull();
	} finally {
		localStorage.removeItem("slidesage-active-generation");
		globalThis.fetch = originalFetch;
	}
});

it("recovers an ambiguous submission through the client-chosen job id", async () => {
	const originalFetch = globalThis.fetch;
	let recoveryURL = "";
	globalThis.fetch = mock(async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.endsWith("/presentation-jobs")) {
			throw new TypeError("Connection closed before headers");
		}
		if (url.includes("/generation-jobs/") && !url.includes("/events")) {
			recoveryURL = url;
			return Response.json({
				id: "discovered_job",
				presentation_id: "discovered_presentation",
				status: "queued",
			});
		}
		return sse(
			'id: 1\nevent: complete\ndata: {"title":"Discovered","theme":"corporate-blue","slides":[{"id":"slide_1","type":"content","blocks":[]}],"totalSlides":1}\n\n' +
				'id: 2\nevent: saved\ndata: {"presentation_id":"discovered_presentation"}\n\n',
		);
	}) as unknown as typeof fetch;

	try {
		const view = render(
			<StreamingProvider>
				<GenerateStarter />
			</StreamingProvider>,
		);
		fireEvent.click(view.getByRole("button", { name: "Start" }));
		await waitFor(() => {
			expect(recoveryURL).toContain("/generation-jobs/");
		});
		expect(recoveryURL).not.toContain("/events");

		await waitFor(() => {
			expect(view.getByTestId("generation-state")).toHaveTextContent("complete:no-error");
		});
	} finally {
		localStorage.removeItem("slidesage-active-generation");
		globalThis.fetch = originalFetch;
	}
});

it("starts a second generation after the first completes", async () => {
	const originalFetch = globalThis.fetch;
	let submitCount = 0;

	globalThis.fetch = mock(async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.endsWith("/presentation-jobs")) {
			submitCount += 1;
			return Response.json(
				{ job_id: `job_${submitCount}`, presentation_id: `pres_${submitCount}` },
				{ status: 202 },
			);
		}
		return sse(
			'id: 1\nevent: complete\ndata: {"title":"Deck","slides":[],"totalSlides":0}\n\n' +
				'id: 2\nevent: saved\ndata: {"presentation_id":"x"}\n\n',
		);
	}) as unknown as typeof fetch;

	try {
		function DoubleStarter() {
			const { generate, streamingState } = useStreaming();
			const [runs, setRuns] = useState(0);
			return (
				<div>
					<span data-testid="done">{streamingState.isComplete ? "complete" : "pending"}</span>
					<button
						type="button"
						onClick={() => {
							void generate({
								prompt: `deck number ${runs + 1}`,
								slideCount: 1,
								detailLevel: "brief",
								tonality: "professional",
							}).then((ok) => {
								if (ok) setRuns((value) => value + 1);
							});
						}}
					>
						Start
					</button>
					<output data-testid="runs">{runs}</output>
				</div>
			);
		}

		const view = render(
			<StreamingProvider>
				<DoubleStarter />
			</StreamingProvider>,
		);

		fireEvent.click(view.getByRole("button", { name: "Start" }));
		await waitFor(() => expect(view.getByTestId("done")).toHaveTextContent("complete"));
		fireEvent.click(view.getByRole("button", { name: "Start" }));
		await waitFor(() => expect(view.getByTestId("runs")).toHaveTextContent("2"));
		expect(submitCount).toBe(2);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
