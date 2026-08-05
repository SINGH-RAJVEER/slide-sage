/// <reference lib="dom" />

import { describe, expect, it } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAutoHideControls } from "../../hooks/useAutoHideControls";

describe("useAutoHideControls", () => {
	it("keeps controls visible when disabled", async () => {
		const { result } = renderHook(() =>
			useAutoHideControls({
				enabled: false,
				hideAfterMs: 1,
			}),
		);

		await new Promise((resolve) => setTimeout(resolve, 5));

		expect(result.current.showControls).toBe(true);
	});

	it("hides controls after inactivity and shows them again on activity", async () => {
		const { result } = renderHook(() =>
			useAutoHideControls({
				enabled: true,
				hideAfterMs: 5,
			}),
		);

		await waitFor(() => {
			expect(result.current.showControls).toBe(false);
		});

		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
		});

		expect(result.current.showControls).toBe(true);
	});
});
