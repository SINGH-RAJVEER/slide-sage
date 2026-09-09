/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { usePresentationData } from "@slidesage/ui/hooks/usePresentationData";
import { renderHook, waitFor } from "@testing-library/react";
import type { NavigateFunction } from "react-router-dom";

const baseStreamingState = {
	isStreaming: false,
	isComplete: false,
	slideCount: 0,
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

it("keeps the committed deck mounted while iteration starts and fails", () => {
	const presentation = {
		title: "Existing deck",
		totalSlides: 12,
		template: { id: "simple-business-proposal", version: 1 },
	};
	const navigate = mock() as unknown as NavigateFunction;
	const { result, rerender } = renderHook(
		({ running, error }: { running: boolean; error?: string }) =>
			usePresentationData({
				apiUrl: "https://api.example.com",
				navigate,
				locationState: { presentation, presentationId: "deck" },
				presentationIdFromParams: "deck",
				isStreamingMode: false,
				streamingState: {
					...baseStreamingState,
					operation: "iteration",
					presentationId: "deck",
					isStreaming: running,
					error,
				},
				getPresentation: () => null,
			}),
		{ initialProps: { running: false, error: undefined as string | undefined } },
	);
	rerender({ running: true, error: undefined });
	expect(result.current.presentation?.title).toBe("Existing deck");
	expect(result.current.isLoading).toBe(false);
	rerender({ running: false, error: "Insufficient points" });
	expect(result.current.presentation?.title).toBe("Existing deck");
	expect(result.current.isLoading).toBe(false);
});
