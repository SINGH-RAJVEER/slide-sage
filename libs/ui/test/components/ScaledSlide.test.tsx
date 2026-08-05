/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { ScaledSlide } from "@slidesage/ui/components/Viewer/ScaledSlide";
import { act, render } from "@testing-library/react";

let resizeCallback: ResizeObserverCallback | undefined;

class ResizeObserverMock {
	constructor(callback: ResizeObserverCallback) {
		resizeCallback = callback;
	}

	observe() {}
	disconnect() {}
	unobserve() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;

function setContainerSize(element: HTMLElement, width: number, height: number) {
	Object.defineProperties(element, {
		clientWidth: { configurable: true, value: width },
		clientHeight: { configurable: true, value: height },
	});
}

describe("ScaledSlide", () => {
	it("uniformly contains a canonical slide within the available space", () => {
		const { container } = render(
			<ScaledSlide>
				<div>Slide</div>
			</ScaledSlide>,
		);
		const frame = container.firstElementChild as HTMLElement;
		setContainerSize(frame, 1000, 400);

		act(() => resizeCallback?.([], {} as ResizeObserver));

		expect((frame.firstElementChild as HTMLElement).style.transform).toBe(`scale(${400 / 720})`);
	});

	it("fits previews from their measured width and updates after resize", () => {
		const { container } = render(
			<ScaledSlide fit="width">
				<div>Slide</div>
			</ScaledSlide>,
		);
		const frame = container.firstElementChild as HTMLElement;
		setContainerSize(frame, 320, 180);

		act(() => resizeCallback?.([], {} as ResizeObserver));
		expect((frame.firstElementChild as HTMLElement).style.transform).toBe("scale(0.25)");

		setContainerSize(frame, 640, 360);
		act(() => resizeCallback?.([], {} as ResizeObserver));
		expect((frame.firstElementChild as HTMLElement).style.transform).toBe("scale(0.5)");
	});

	it("reports readiness after the frame has a measurable size", () => {
		const onReadyChange = mock(() => {});
		const { container } = render(
			<ScaledSlide onReadyChange={onReadyChange}>
				<div>Slide</div>
			</ScaledSlide>,
		);
		const frame = container.firstElementChild as HTMLElement;

		expect(onReadyChange).toHaveBeenLastCalledWith(false);
		setContainerSize(frame, 1280, 720);
		act(() => resizeCallback?.([], {} as ResizeObserver));
		expect(onReadyChange).toHaveBeenLastCalledWith(true);
	});
});
