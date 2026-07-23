/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import {
    getViewerKeyboardDestination,
    useViewerKeyboardNavigation,
} from "@/hooks/useViewerKeyboardNavigation";

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
    return <input aria-label="Ignored input" />;
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
        const view = render(<Harness onNavigate={onNavigate} onStopPlayback={mock(() => {})} />);

        fireEvent.keyDown(view.getByRole("textbox", { name: "Ignored input" }), {
            key: "ArrowRight",
        });

        expect(onNavigate).not.toHaveBeenCalled();
    });
});
