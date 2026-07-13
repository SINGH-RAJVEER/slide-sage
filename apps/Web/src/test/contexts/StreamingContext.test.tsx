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
            <button
                type="button"
                onClick={() => {
                    void startStreaming("Background generation", 2, "balanced", "professional");
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

function AwayPage() {
    const { streamingState } = useStreaming();

    return (
        <span>
            {streamingState.isStreaming ? "streaming" : "stopped"}:
            {streamingState.isComplete ? "complete" : "pending"}:{streamingState.slides.length}:
            {streamingState.presentationId ?? "none"}
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
    const presentationUpdated = mock((_event: Event) => {});

    window.addEventListener(PRESENTATIONS_UPDATED_EVENT, presentationUpdated);
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
                <NavigationHarness />
            </StreamingProvider>,
        );

        fireEvent.click(view.getByRole("button", { name: "Start" }));
        await waitFor(() => expect(view.getByText("streaming")).toBeInTheDocument());
        fireEvent.click(view.getByRole("button", { name: "Navigate away" }));

        await act(async () => {
            streamController?.enqueue(
                encoder.encode(
                    'event: created\ndata: {"presentation_id":"presentation_1"}\n\n' +
                        'event: slide\ndata: {"slide":{"id":"slide_1","type":"content","content":{}},"title":"Background deck"}\n\n' +
                        'event: complete\ndata: {"title":"Background deck","slides":[{"id":"slide_1","type":"content","content":{}}],"totalSlides":1}\n\n' +
                        'event: saved\ndata: {"presentation_id":"presentation_1"}\n\n',
                ),
            );
            streamController?.close();
        });

        await waitFor(() => {
            expect(view.getByText("stopped:complete:1:presentation_1")).toBeInTheDocument();
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
