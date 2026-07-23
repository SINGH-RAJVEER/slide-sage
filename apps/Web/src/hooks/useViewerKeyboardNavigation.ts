import { useEffect, useRef } from "react";

export function getViewerKeyboardDestination(
    key: string,
    currentSlide: number,
    slideCount: number,
) {
    if (key === "ArrowLeft" || key.toLowerCase() === "j") {
        return Math.max(currentSlide - 1, 0);
    }
    if (key === "ArrowRight" || key.toLowerCase() === "l") {
        return Math.min(currentSlide + 1, slideCount - 1);
    }
    if (key === "ArrowUp") return 0;
    if (key === "ArrowDown") return slideCount - 1;
    return undefined;
}

export function useViewerKeyboardNavigation({
    currentSlide,
    slideCount,
    onNavigate,
    onStopPlayback,
}: {
    currentSlide: number;
    slideCount: number;
    onNavigate: (index: number) => void;
    onStopPlayback: () => void;
}) {
    const keyboardSlideRef = useRef(currentSlide);

    useEffect(() => {
        keyboardSlideRef.current = currentSlide;
    }, [currentSlide]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (slideCount <= 0) return;
            const target = event.target as HTMLElement | null;
            if (target?.matches("input, textarea, select") || target?.isContentEditable) return;

            const nextIndex = getViewerKeyboardDestination(
                event.key,
                keyboardSlideRef.current,
                slideCount,
            );

            if (nextIndex === undefined) return;
            event.preventDefault();
            if (event.repeat) return;
            onStopPlayback();
            keyboardSlideRef.current = nextIndex;
            onNavigate(nextIndex);
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onNavigate, onStopPlayback, slideCount]);
}
