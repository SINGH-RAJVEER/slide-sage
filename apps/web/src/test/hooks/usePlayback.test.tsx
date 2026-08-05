/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { usePlayback } from "../../hooks/usePlayback";

describe("usePlayback", () => {
	it("does not start playback for a single-slide deck", () => {
		const onAdvance = mock();
		const { result } = renderHook(() =>
			usePlayback({
				slideCount: 1,
				currentSlide: 0,
				slideIntervalSeconds: 5,
				onAdvance,
			}),
		);

		act(() => result.current.toggle());

		expect(result.current.isPlaying).toBe(false);
		expect(onAdvance).not.toHaveBeenCalled();
	});

	it("requests a restart and stops when toggled from the final slide", () => {
		const onAdvance = mock();
		const { result } = renderHook(() =>
			usePlayback({
				slideCount: 3,
				currentSlide: 2,
				slideIntervalSeconds: 5,
				onAdvance,
			}),
		);

		act(() => result.current.toggle());

		expect(result.current.isPlaying).toBe(false);
		expect(onAdvance).toHaveBeenCalledWith(0);
	});

	it("can be stopped after playback starts", () => {
		const { result } = renderHook(() =>
			usePlayback({
				slideCount: 3,
				currentSlide: 0,
				slideIntervalSeconds: 5,
				onAdvance: mock(),
			}),
		);

		act(() => result.current.toggle());
		expect(result.current.isPlaying).toBe(true);

		act(() => result.current.stop());
		expect(result.current.isPlaying).toBe(false);
	});
});
