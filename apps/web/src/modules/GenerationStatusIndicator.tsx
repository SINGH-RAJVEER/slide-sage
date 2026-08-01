import { GenerationStatusIndicatorView } from "@slidesage/ui/components/GenerationStatusIndicator";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { showGenerationCompleteNotification } from "@/lib/generation-notifications";
import { getGenerationDisplayStatus } from "@/lib/generation-status";
import { useStreaming } from "@/modules/contexts/StreamingContext";
import { ROUTES } from "@/router/paths";

export const GENERATION_ERROR_COOLDOWN_MS = 8000;
const AUTH_STATUS_SUPPRESSED_PATHS = new Set<string>([ROUTES.signIn, "/login"]);

export default function GenerationStatusIndicator() {
    const { streamingState } = useStreaming();
    const location = useLocation();
    const navigate = useNavigate();
    const [dismissedCompletion, setDismissedCompletion] = useState<string | null>(null);
    const notifiedCompletionRef = useRef<string | null>(null);

    const isIteration = streamingState.operation === "iteration";
    const activePath =
        isIteration && streamingState.presentationId
            ? ROUTES.presentationById(streamingState.presentationId)
            : ROUTES.presentation;
    const completedPath = streamingState.presentationId
        ? ROUTES.presentationById(streamingState.presentationId)
        : ROUTES.presentations;
    const completionKey = streamingState.presentationId
        ? `${streamingState.presentationId}:${streamingState.slides.length}`
        : null;
    const errorKey = streamingState.error
        ? `${streamingState.presentationId ?? "unsaved"}:${streamingState.error}`
        : null;

    useEffect(() => {
        if (streamingState.isStreaming) {
            notifiedCompletionRef.current = null;
            return;
        }
        if (!streamingState.isComplete || !completionKey) return;
        if (notifiedCompletionRef.current === completionKey) return;
        notifiedCompletionRef.current = completionKey;
        showGenerationCompleteNotification({
            presentationId: streamingState.presentationId || completionKey,
            title: streamingState.title,
            onActivate: () => navigate(completedPath),
        });
    }, [completedPath, completionKey, navigate, streamingState]);

    if (AUTH_STATUS_SUPPRESSED_PATHS.has(location.pathname)) {
        return null;
    }

    if (streamingState.error && location.pathname !== ROUTES.presentationError) {
        return (
            <GenerationStatusIndicatorView
                key={errorKey}
                status="error"
                title="Generation stopped"
                detail={streamingState.error}
                autoDismissMs={GENERATION_ERROR_COOLDOWN_MS}
                onActivate={() =>
                    navigate(ROUTES.presentationError, {
                        state: {
                            error: streamingState.error,
                            presentationId: streamingState.presentationId,
                        },
                    })
                }
            />
        );
    }

    if (streamingState.isStreaming) {
        if (location.pathname === activePath) return null;

        const generationStatus = getGenerationDisplayStatus(streamingState);

        return (
            <GenerationStatusIndicatorView
                status="active"
                title={isIteration ? "Updating presentation" : "Generating presentation"}
                detail={generationStatus.message}
                progress={generationStatus.progress}
                onActivate={() =>
                    navigate(activePath, {
                        state: {
                            isStreaming: true,
                            presentationId: streamingState.presentationId,
                        },
                    })
                }
            />
        );
    }

    if (
        streamingState.isComplete &&
        completionKey &&
        dismissedCompletion !== completionKey &&
        location.pathname !== completedPath
    ) {
        return (
            <GenerationStatusIndicatorView
                status="complete"
                title="Presentation ready"
                detail="Saved to Presentations"
                onActivate={() => {
                    setDismissedCompletion(completionKey);
                    navigate(completedPath, {
                        state: {
                            presentation: {
                                title: streamingState.title,
                                theme: streamingState.theme,
                                slides: streamingState.slides,
                                totalSlides: streamingState.slides.length,
                            },
                            presentationId: streamingState.presentationId,
                            isNewGeneration: true,
                        },
                    });
                }}
            />
        );
    }

    return null;
}
