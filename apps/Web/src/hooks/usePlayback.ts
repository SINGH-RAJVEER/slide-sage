import { useCallback, useEffect, useState } from "react";

export function usePlayback({
    slideCount,
    currentSlide,
    slideIntervalSeconds,
    onAdvance,
}: {
    slideCount: number;
    currentSlide: number;
    slideIntervalSeconds: number;
    onAdvance: (nextIndex: number) => void;
}) {
    const [isPlaying, setIsPlaying] = useState(false);

    const stop = useCallback(() => setIsPlaying(false), []);

    const toggle = useCallback(() => {
        setIsPlaying((prev) => {
            if (prev) return false;
            if (slideCount <= 1) return false;
            // If we're at the end, restart from the beginning
            if (currentSlide >= slideCount - 1) {
                onAdvance(0);
            }
            return true;
        });
    }, [currentSlide, onAdvance, slideCount]);

    // Stop when we reach the end
    useEffect(() => {
        if (!isPlaying) return;
        if (slideCount <= 1) {
            setIsPlaying(false);
            return;
        }
        if (currentSlide >= slideCount - 1) {
            setIsPlaying(false);
        }
    }, [currentSlide, isPlaying, slideCount]);

    // Advance on interval
    useEffect(() => {
        if (!isPlaying) return;
        if (slideCount <= 1) return;
        if (slideIntervalSeconds <= 0) return;
        if (currentSlide >= slideCount - 1) return;

        const id = setInterval(() => {
            onAdvance(currentSlide + 1);
        }, Math.max(slideIntervalSeconds, 0) * 1000);

        return () => clearInterval(id);
    }, [currentSlide, isPlaying, onAdvance, slideCount, slideIntervalSeconds]);

    return { isPlaying, setIsPlaying, toggle, stop };
}
