import { describe, expect, it } from "bun:test";
import { tweenNumber } from "@slide-sage/ui/lib/presentation-motion";

describe("presentation motion", () => {
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
