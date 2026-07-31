import { describe, expect, it } from "bun:test";
import { tweenNumber } from "@slide-sage/ui/lib/presentation-motion";

describe("presentation motion", () => {
    it("finishes synchronously when animation duration is not positive", () => {
        const values: number[] = [];
        let completed = 0;

        tweenNumber({
            from: 3,
            to: 9,
            durationMs: 0,
            onUpdate: (value) => values.push(value),
            onComplete: () => {
                completed += 1;
            },
        });

        expect(values).toEqual([9]);
        expect(completed).toBe(1);
    });

    it("updates a linear tween and completes exactly once", () => {
        const originalAnimationFrame = globalThis.requestAnimationFrame;
        const callbacks: FrameRequestCallback[] = [];
        globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
            callbacks.push(callback);
            return callbacks.length;
        }) as typeof requestAnimationFrame;
        const values: number[] = [];
        let completed = 0;

        try {
            tweenNumber({
                from: 0,
                to: 10,
                durationMs: 100,
                easing: "linear",
                onUpdate: (value) => values.push(value),
                onComplete: () => {
                    completed += 1;
                },
            });
            const startedAt = performance.now();
            callbacks.shift()?.(startedAt + 50);
            callbacks.shift()?.(startedAt + 100);

            expect(values[0]).toBeCloseTo(5, 1);
            expect(values.at(-1)).toBe(10);
            expect(completed).toBe(1);
        } finally {
            globalThis.requestAnimationFrame = originalAnimationFrame;
        }
    });

    it("finishes immediately when reduced motion is requested", () => {
        const previous = window.matchMedia;
        window.matchMedia = ((query: string) =>
            ({ matches: true, media: query }) as MediaQueryList) as typeof window.matchMedia;
        const values: number[] = [];
        let completed = false;

        tweenNumber({
            from: 0,
            to: 42,
            durationMs: 700,
            onUpdate: (value) => values.push(value),
            onComplete: () => {
                completed = true;
            },
        });

        expect(values).toEqual([42]);
        expect(completed).toBe(true);
        window.matchMedia = previous;
    });
});
