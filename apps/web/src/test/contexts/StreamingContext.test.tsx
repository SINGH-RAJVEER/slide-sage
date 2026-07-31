/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import {
    PRESENTATIONS_UPDATED_EVENT,
    type PresentationUpdatedDetail,
} from "@/lib/presentation-events";
import { StreamingProvider, useStreaming } from "@/modules/contexts/StreamingContext";

function StreamingStarter({ onNavigateAway }: { onNavigateAway: () => void }) {
    const { startStreaming, streamingState } = useStreaming();

    return (
        <div>
            <span>{streamingState.isStreaming ? "streaming" : "idle"}</span>
            <output data-testid="generation-state">
                {streamingState.isComplete ? "complete" : "pending"}:
                {streamingState.error ?? "no-error"}
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
                {streamingState.isComplete ? "complete" : "pending"}:
                {streamingState.error ?? "no-error"}
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
                        'event: stage\ndata: {"stage":"planning","message":"Structuring the narrative","completed":1,"total":4}\n\n' +
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
            expect(
                view.getByText("stopped:complete:1:presentation_1:planning"),
            ).toBeInTheDocument();
        });
        expect(presentationUpdated).toHaveBeenCalledTimes(1);
        const event = presentationUpdated.mock
            .calls[0]?.[0] as CustomEvent<PresentationUpdatedDetail>;
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

it("clears iteration completion when an error follows complete and saved", async () => {
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
            expect(view.getByTestId("iteration-state")).toHaveTextContent(
                "idle:pending:Save confirmation was revoked",
            );
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});
