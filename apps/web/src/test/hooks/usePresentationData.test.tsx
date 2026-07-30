/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import type { NavigateFunction } from "react-router-dom";
import { usePresentationData } from "@/hooks/usePresentationData";

const baseStreamingState = {
    isStreaming: false,
    isComplete: false,
    slides: [],
    theme: "corporate-blue",
    title: "Untitled Presentation",
};

it("shows the generation loader before the streaming state reaches the viewer", () => {
    const { result } = renderHook(() =>
        usePresentationData({
            apiUrl: "https://api.example.com",
            navigate: mock() as unknown as NavigateFunction,
            locationState: { isStreaming: true },
            isStreamingMode: true,
            streamingState: baseStreamingState,
            getPresentation: () => null,
        }),
    );

    expect(result.current.shouldShowGenerating).toBe(true);
    expect(result.current.presentation).toBeUndefined();
});

it("leaves the pre-stream loader when generation fails", async () => {
    const navigate = mock();
    renderHook(() =>
        usePresentationData({
            apiUrl: "https://api.example.com",
            navigate: navigate as unknown as NavigateFunction,
            locationState: { isStreaming: true },
            isStreamingMode: true,
            streamingState: { ...baseStreamingState, error: "The stream could not start." },
            getPresentation: () => null,
        }),
    );

    await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith("/presentation-error", {
            replace: true,
            state: {
                error: "The stream could not start.",
                presentationId: undefined,
            },
        }),
    );
});
