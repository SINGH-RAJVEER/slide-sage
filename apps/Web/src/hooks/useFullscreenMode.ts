import { useCallback, useEffect, useState } from "react";

export function useFullscreenMode() {
    const [isFullscreenMode, setIsFullscreenMode] = useState(false);

    const enter = useCallback(async () => {
        setIsFullscreenMode(true);

        // Try to enter browser fullscreen as well (best-effort).
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            }
        } catch {
            // Ignore; UI fullscreen mode still works.
        }
    }, []);

    const exit = useCallback(async () => {
        setIsFullscreenMode(false);

        // Best-effort exit browser fullscreen.
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            }
        } catch {
            // Ignore
        }
    }, []);

    const toggle = useCallback(() => {
        if (isFullscreenMode) {
            void exit();
        } else {
            void enter();
        }
    }, [enter, exit, isFullscreenMode]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                // Esc / user action exited browser fullscreen; also exit UI mode.
                setIsFullscreenMode(false);
            }
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
        };
    }, []);

    return {
        isFullscreenMode,
        setIsFullscreenMode,
        enter,
        exit,
        toggle,
    };
}
