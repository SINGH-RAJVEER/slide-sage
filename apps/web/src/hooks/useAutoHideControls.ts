import { useEffect, useRef, useState } from "react";

export function useAutoHideControls({
    enabled,
    hideAfterMs = 2500,
}: {
    enabled: boolean;
    hideAfterMs?: number;
}) {
    const [showControls, setShowControls] = useState(true);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!enabled) {
            setShowControls(true);
            return;
        }

        const scheduleHide = () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setShowControls(false), hideAfterMs);
        };

        const handleActivity = () => {
            setShowControls(true);
            scheduleHide();
        };

        scheduleHide();
        window.addEventListener("mousemove", handleActivity, { passive: true });
        window.addEventListener("keydown", handleActivity);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            window.removeEventListener("mousemove", handleActivity);
            window.removeEventListener("keydown", handleActivity);
        };
    }, [enabled, hideAfterMs]);

    return { showControls, setShowControls };
}
