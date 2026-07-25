import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;

interface ScaledSlideProps {
    children: ReactNode;
    className?: string;
    stageClassName?: string;
    fit?: "contain" | "width";
    onReadyChange?: (ready: boolean) => void;
}

export function ScaledSlide({
    children,
    className,
    stageClassName,
    fit = "contain",
    onReadyChange,
}: ScaledSlideProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateScale = () => {
            const widthScale = container.clientWidth / SLIDE_WIDTH;
            const heightScale = container.clientHeight / SLIDE_HEIGHT;
            const nextScale = fit === "width" ? widthScale : Math.min(widthScale, heightScale);
            setScale(Number.isFinite(nextScale) ? Math.max(nextScale, 0) : 0);
        };

        updateScale();
        const observer = new ResizeObserver(updateScale);
        observer.observe(container);
        return () => observer.disconnect();
    }, [fit]);

    useEffect(() => {
        onReadyChange?.(scale > 0);
    }, [onReadyChange, scale]);

    const stageStyle = {
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        transform: `scale(${scale})`,
        visibility: scale > 0 ? "visible" : "hidden",
    } satisfies CSSProperties;

    return (
        <div
            ref={containerRef}
            className={cn(
                "relative flex h-full w-full items-center justify-center overflow-hidden",
                className,
            )}
            data-slide-scale={scale}
        >
            <div className={cn("absolute origin-center", stageClassName)} style={stageStyle}>
                {children}
            </div>
        </div>
    );
}
