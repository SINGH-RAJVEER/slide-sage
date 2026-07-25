import { afterEach, describe, expect, it, jest, mock } from "bun:test";
import {
    getKeyboardNavigationTarget,
    KEYBOARD_NAVIGATION_REPEAT_DELAY_MS,
    KEYBOARD_NAVIGATION_REPEAT_INTERVAL_MS,
    startKeyboardNavigationRepeat,
} from "@/hooks/useSlideNavigation";

afterEach(() => {
    jest.useRealTimers();
});

describe("viewer keyboard navigation", () => {
    it("advances one slide for each navigation step", () => {
        const events = [
            new KeyboardEvent("keydown", { key: "ArrowRight" }),
            new KeyboardEvent("keydown", { key: "ArrowRight", repeat: true }),
            new KeyboardEvent("keydown", { key: "ArrowRight", repeat: true }),
        ];
        let currentSlide = 0;

        for (const event of events) {
            currentSlide = getKeyboardNavigationTarget(event, currentSlide, 5) ?? currentSlide;
        }

        expect(currentSlide).toBe(3);
    });

    it("supports J and L navigation without crossing deck boundaries", () => {
        expect(
            getKeyboardNavigationTarget(
                new KeyboardEvent("keydown", { key: "j", repeat: true }),
                0,
                5,
            ),
        ).toBe(0);
        expect(
            getKeyboardNavigationTarget(
                new KeyboardEvent("keydown", { key: "L", repeat: true }),
                4,
                5,
            ),
        ).toBe(4);
    });

    it("uses a short hold delay followed by a controlled repeat interval", () => {
        jest.useFakeTimers();
        const onRepeat = mock(() => {});
        const stopRepeating = startKeyboardNavigationRepeat(onRepeat);

        jest.advanceTimersByTime(KEYBOARD_NAVIGATION_REPEAT_DELAY_MS - 1);
        expect(onRepeat).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        expect(onRepeat).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(KEYBOARD_NAVIGATION_REPEAT_INTERVAL_MS * 2);
        expect(onRepeat).toHaveBeenCalledTimes(3);

        stopRepeating();
        jest.advanceTimersByTime(KEYBOARD_NAVIGATION_REPEAT_INTERVAL_MS * 2);
        expect(onRepeat).toHaveBeenCalledTimes(3);
    });
});
