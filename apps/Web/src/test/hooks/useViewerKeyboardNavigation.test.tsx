/// <reference lib="dom" />

import { afterEach, describe, expect, it, jest, mock } from "bun:test";
import { act, render } from "@testing-library/react";
import { useState } from "react";
import {
    KEYBOARD_NAVIGATION_REPEAT_DELAY_MS,
    KEYBOARD_NAVIGATION_REPEAT_INTERVAL_MS,
} from "@/hooks/useSlideNavigation";
import {
    getViewerKeyboardDestination,
    useViewerKeyboardNavigation,
} from "@/hooks/useViewerKeyboardNavigation";

afterEach(() => {
    jest.useRealTimers();
});

function Harness({
    currentSlide = 1,
    onNavigate,
    onStopPlayback,
}: {
    currentSlide?: number;
    onNavigate: (index: number) => void;
    onStopPlayback: () => void;
}) {
    useViewerKeyboardNavigation({
        currentSlide,
        slideCount: 4,
        onNavigate,
        onStopPlayback,
    });
    return null;
}

function RerenderingHarness({ onNavigate }: { onNavigate: (index: number) => void }) {
    const [currentSlide, setCurrentSlide] = useState(0);

    useViewerKeyboardNavigation({
        currentSlide,
        slideCount: 4,
        onNavigate: (index) => {
            setCurrentSlide(index);
            onNavigate(index);
        },
        onStopPlayback: () => {},
    });
    return null;
}

describe("useViewerKeyboardNavigation", () => {
    it("maps viewer arrow and J/L navigation keys", () => {
        expect(getViewerKeyboardDestination("ArrowRight", 1, 4)).toBe(2);
        expect(getViewerKeyboardDestination("l", 2, 4)).toBe(3);
        expect(getViewerKeyboardDestination("ArrowLeft", 2, 4)).toBe(1);
        expect(getViewerKeyboardDestination("J", 1, 4)).toBe(0);
        expect(getViewerKeyboardDestination("ArrowUp", 2, 4)).toBe(0);
        expect(getViewerKeyboardDestination("ArrowDown", 1, 4)).toBe(3);
        expect(getViewerKeyboardDestination("Escape", 1, 4)).toBeUndefined();
    });

    it("does not navigate while typing in a form control", () => {
        const onNavigate = mock(() => {});
        render(<Harness onNavigate={onNavigate} onStopPlayback={mock(() => {})} />);
        const input = document.createElement("input");
        document.body.append(input);

        input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

        expect(onNavigate).not.toHaveBeenCalled();
        input.remove();
    });

    it("uses controlled repeat navigation while a key is held", () => {
        jest.useFakeTimers();
        const onNavigate = mock(() => {});
        render(
            <Harness currentSlide={0} onNavigate={onNavigate} onStopPlayback={mock(() => {})} />,
        );

        act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
        });
        expect(onNavigate).toHaveBeenLastCalledWith(1);

        act(() => {
            jest.advanceTimersByTime(KEYBOARD_NAVIGATION_REPEAT_DELAY_MS);
        });
        expect(onNavigate).toHaveBeenLastCalledWith(2);

        act(() => {
            jest.advanceTimersByTime(KEYBOARD_NAVIGATION_REPEAT_INTERVAL_MS);
        });
        expect(onNavigate).toHaveBeenLastCalledWith(3);

        act(() => {
            window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight" }));
        });
        jest.advanceTimersByTime(KEYBOARD_NAVIGATION_REPEAT_INTERVAL_MS * 2);
        expect(onNavigate).toHaveBeenCalledTimes(3);
    });

    it("keeps repeating when navigation rerenders the viewer", () => {
        jest.useFakeTimers();
        const onNavigate = mock(() => {});
        render(<RerenderingHarness onNavigate={onNavigate} />);

        act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
        });
        expect(onNavigate).toHaveBeenLastCalledWith(1);

        act(() => {
            jest.advanceTimersByTime(KEYBOARD_NAVIGATION_REPEAT_DELAY_MS);
        });
        expect(onNavigate).toHaveBeenLastCalledWith(2);

        act(() => {
            jest.advanceTimersByTime(KEYBOARD_NAVIGATION_REPEAT_INTERVAL_MS);
        });
        expect(onNavigate).toHaveBeenLastCalledWith(3);

        act(() => {
            window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight" }));
        });
    });
});
