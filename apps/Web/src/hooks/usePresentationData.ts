import { useEffect, useMemo, useRef, useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { PresentationData, Slide } from "@/modules/types/presentation";
import { ROUTES } from "@/router/paths";

export interface ViewerLocationState {
    isStreaming?: boolean;
    presentation?: PresentationData;
    isNewGeneration?: boolean;
    presentationId?: string;
}

interface StreamingLikeState {
    isStreaming: boolean;
    isComplete: boolean;
    slides: Slide[];
    theme: string;
    title: string;
    presentationId?: string;
}

interface UsePresentationDataParams {
    apiUrl: string;
    navigate: NavigateFunction;
    locationState?: ViewerLocationState;
    presentationIdFromParams?: string;
    isStreamingMode: boolean;
    streamingState: StreamingLikeState;
    getPresentation: () => PresentationData | null;
}

export function usePresentationData({
    apiUrl,
    navigate,
    locationState,
    presentationIdFromParams,
    isStreamingMode,
    streamingState,
    getPresentation,
}: UsePresentationDataParams) {
    const getInitialPresentation = (): PresentationData | undefined => {
        if (isStreamingMode) return getPresentation() || undefined;
        if (locationState?.presentation) return locationState.presentation;
        if (locationState?.isNewGeneration) return locationState.presentation;
        return undefined;
    };

    const [presentation, setPresentation] = useState<PresentationData | undefined>(
        getInitialPresentation(),
    );

    const [presentationId, setPresentationId] = useState<string | undefined>(
        presentationIdFromParams || locationState?.presentationId || streamingState.presentationId,
    );

    const [isLoading, setIsLoading] = useState(
        !isStreamingMode &&
            !locationState?.presentation &&
            !locationState?.isNewGeneration &&
            !!(presentationIdFromParams || locationState?.presentationId),
    );

    const streamingSlidesCount = streamingState.slides.length;

    // Keep presentationId in sync with URL param changes
    useEffect(() => {
        if (presentationIdFromParams && presentationIdFromParams !== presentationId) {
            setPresentationId(presentationIdFromParams);
        }
    }, [presentationIdFromParams, presentationId]);

    // When streaming starts and we have no slides yet, clear previous state
    useEffect(() => {
        if (streamingState.isStreaming && streamingSlidesCount === 0) {
            setPresentation(undefined);
        }
    }, [streamingState.isStreaming, streamingSlidesCount]);

    // Update presentation while streaming
    useEffect(() => {
        if (streamingState.isStreaming && streamingSlidesCount > 0) {
            setPresentation({
                title: streamingState.title,
                theme: streamingState.theme,
                slides: streamingState.slides.map((s) => ({ ...s })),
                totalSlides: streamingSlidesCount,
            });
        }
    }, [
        streamingState.isStreaming,
        streamingSlidesCount,
        streamingState.title,
        streamingState.theme,
        streamingState.slides,
    ]);

    // Capture final presentation state when streaming completes
    useEffect(() => {
        if (
            streamingState.isComplete &&
            !streamingState.isStreaming &&
            streamingState.slides.length > 0
        ) {
            setPresentation({
                title: streamingState.title,
                theme: streamingState.theme,
                slides: streamingState.slides.map((s) => ({ ...s })),
                totalSlides: streamingState.slides.length,
            });
        }
    }, [
        streamingState.isComplete,
        streamingState.isStreaming,
        streamingState.slides,
        streamingState.title,
        streamingState.theme,
    ]);

    // If we learn the presentationId from the stream, capture it
    useEffect(() => {
        if (streamingState.presentationId && !presentationId) {
            setPresentationId(streamingState.presentationId);
        }
    }, [streamingState.presentationId, presentationId]);

    // Track if streaming just completed - used to avoid racing the DB fetch
    const streamingJustCompletedRef = useRef(false);
    const wasStreamingRef = useRef(streamingState.isStreaming);

    useEffect(() => {
        if (wasStreamingRef.current && !streamingState.isStreaming && streamingState.isComplete) {
            streamingJustCompletedRef.current = true;
        }
        wasStreamingRef.current = streamingState.isStreaming;
    }, [streamingState.isStreaming, streamingState.isComplete]);

    const idToFetch = useMemo(() => {
        return presentationIdFromParams || presentationId || locationState?.presentationId;
    }, [presentationIdFromParams, presentationId, locationState?.presentationId]);

    const presentationHasSlides = !!presentation && presentation.slides.length > 0;

    const lastFetchedPresentationIdRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        const fetchPresentation = async () => {
            if (streamingState.isStreaming) {
                setIsLoading(false);
                return;
            }

            if (streamingJustCompletedRef.current && presentationHasSlides) {
                setIsLoading(false);
                streamingJustCompletedRef.current = false;
                return;
            }

            if (streamingState.isComplete && streamingState.slides.length > 0) {
                setIsLoading(false);
                return;
            }

            if (!idToFetch) {
                setIsLoading(false);
                return;
            }

            if (
                locationState?.presentation &&
                locationState.presentationId === idToFetch &&
                presentationHasSlides
            ) {
                setIsLoading(false);
                return;
            }

            if (isStreamingMode && presentationHasSlides) {
                setIsLoading(false);
                return;
            }

            if (lastFetchedPresentationIdRef.current === idToFetch) {
                return;
            }

            lastFetchedPresentationIdRef.current = idToFetch;
            setIsLoading(true);

            try {
                const response = await fetch(`${apiUrl}/api/presentations/${idToFetch}`, {
                    credentials: "include",
                });

                if (!response.ok) return;

                const data = await response.json();
                if (data?.error) {
                    console.error("Error loading presentation:", data.error.message || data.error);
                    return;
                }

                const pres = data?.presentation;
                if (!pres) return;

                const slidesData = pres.slides || pres.slides_data || {};
                const fetchedSlides = slidesData.slides || [];

                if (fetchedSlides.length > 0 && pres.title !== "Generating...") {
                    setPresentation({
                        title: pres.title || slidesData.title,
                        theme: slidesData.theme || "corporate-blue",
                        slides: fetchedSlides,
                        totalSlides: slidesData.totalSlides || fetchedSlides.length || 0,
                    });
                    setPresentationId(pres.id);
                    return;
                }

                if (pres.title === "Generating..." || fetchedSlides.length === 0) {
                    navigate(ROUTES.presentationError, {
                        state: {
                            presentationId: pres.id,
                            error: "This presentation failed to generate content.",
                        },
                    });
                }
            } catch (error) {
                console.error("Error fetching presentation:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPresentation();
    }, [
        apiUrl,
        idToFetch,
        isStreamingMode,
        locationState?.presentation,
        locationState?.presentationId,
        navigate,
        presentationHasSlides,
        streamingState.isComplete,
        streamingState.isStreaming,
        streamingState.slides.length,
    ]);

    // Redirect home when we have no way to render anything
    const hasLocationPresentation = !!locationState?.presentation;
    const isLocationStreaming = !!locationState?.isStreaming;
    const hasLocationPresentationId = !!locationState?.presentationId;

    useEffect(() => {
        if (isLoading) return;
        if (streamingState.isStreaming) return;
        if (streamingState.isComplete && streamingState.slides.length > 0) return;
        if (presentationHasSlides) return;
        if (presentationId) return;

        if (!hasLocationPresentation && !isLocationStreaming && !hasLocationPresentationId) {
            navigate(ROUTES.home);
        }
    }, [
        hasLocationPresentation,
        hasLocationPresentationId,
        isLoading,
        isLocationStreaming,
        navigate,
        presentationHasSlides,
        presentationId,
        streamingState.isComplete,
        streamingState.isStreaming,
        streamingState.slides.length,
    ]);

    const shouldShowGenerating =
        streamingState.isStreaming && (!presentation || presentation.slides.length === 0);

    return {
        presentation,
        setPresentation,
        presentationId,
        setPresentationId,
        isLoading,
        streamingSlidesCount,
        shouldShowGenerating,
    };
}
