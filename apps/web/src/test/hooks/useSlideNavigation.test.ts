import { afterEach, describe, expect, it, jest, mock } from "bun:test";
import {
    KEYBOARD_NAVIGATION_REPEAT_DELAY_MS,
    KEYBOARD_NAVIGATION_REPEAT_INTERVAL_MS,
    startKeyboardNavigationRepeat,
} from "@/hooks/useSlideNavigation";

afterEach(() => {
    jest.useRealTimers();
});

describe("viewer keyboard navigation", () => {
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
