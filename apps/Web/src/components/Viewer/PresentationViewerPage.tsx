import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import IterateModal from "@/components/Viewer/IterateModal";
import { useAutoHideControls } from "@/hooks/useAutoHideControls";
import { useFullscreenMode } from "@/hooks/useFullscreenMode";
import { usePlayback } from "@/hooks/usePlayback";
import type { ViewerLocationState } from "@/hooks/usePresentationData";
import { usePresentationData } from "@/hooks/usePresentationData";
import { useSlideNavigation } from "@/hooks/useSlideNavigation";
import { API_URL } from "@/lib/api";
import { useStreaming } from "@/modules/presentations";
import { useTemplate } from "@/modules/useTemplate";
import { ROUTES } from "@/router/paths";
import { CenteredStatusScreen } from "./CenteredStatusScreen";
import { SlideRenderer } from "./SlideRenderer";
import { ViewerFullscreenOverlayControls } from "./ViewerFullscreenOverlayControls";
import { ViewerHeaderControls } from "./ViewerHeaderControls";
import { ViewerNavigationControls } from "./ViewerNavigationControls";
import { ViewerSlideCarousel } from "./ViewerSlideCarousel";
import { ViewerThumbnails } from "./ViewerThumbnails";

export default function PresentationViewerPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const params = useParams();
    const { streamingState, getPresentation, startIterating } = useStreaming();
    const { currentTemplate, changeTemplate } = useTemplate();

    const locationState = location.state as ViewerLocationState | undefined;

    const presentationIdFromParams = useMemo(() => {
        const raw = params.presentationId;
        if (!raw) return undefined;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : undefined;
    }, [params.presentationId]);

    const isStreamingMode = locationState?.isStreaming === true;

    const {
        presentation,
        setPresentation,
        presentationId,
        isLoading,
        streamingSlidesCount,
        shouldShowGenerating,
    } = usePresentationData({
        apiUrl: API_URL,
        navigate,
        locationState,
        presentationIdFromParams,
        isStreamingMode,
        streamingState,
        getPresentation,
    });

    const slideContainerRef = useRef<HTMLDivElement | null>(null);
    const navigation = useSlideNavigation({
        slideCount: presentation?.slides.length ?? 0,
        slideContainerRef,
    });

    const { isFullscreenMode, enter: enterFullscreen, exit: exitFullscreen } = useFullscreenMode();

    const { showControls, setShowControls } = useAutoHideControls({
        enabled: isFullscreenMode,
    });

    // Keep controls visible in non-fullscreen mode
    useEffect(() => {
        if (!isFullscreenMode) setShowControls(true);
    }, [isFullscreenMode, setShowControls]);

    const [slideInterval, setSlideInterval] = useState(5);
    const [intervalMode, setIntervalMode] = useState<"preset" | "custom">("preset");
    const [customInterval, setCustomInterval] = useState("5");
    const customInputRef = useRef<HTMLInputElement | null>(null);

    // Focus custom interval input when it appears
    useEffect(() => {
        if (intervalMode === "custom") {
            customInputRef.current?.focus();
        }
    }, [intervalMode]);

    const slideCount = presentation?.slides.length ?? 0;

    const playback = usePlayback({
        slideCount,
        currentSlide: navigation.currentSlide,
        slideIntervalSeconds: slideInterval,
        onAdvance: (nextIndex) => {
            navigation.scrollToSlide(nextIndex, "smooth");
        },
    });

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (slideCount <= 0) return;

            if (e.key === "ArrowLeft" || e.key.toLowerCase() === "j") {
                playback.stop();
                navigation.prev("auto");
            } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "l") {
                playback.stop();
                navigation.next("auto");
            } else if (e.key === "ArrowUp") {
                playback.stop();
                navigation.first("auto");
            } else if (e.key === "ArrowDown") {
                playback.stop();
                navigation.last("auto");
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
        slideCount,
        navigation.first,
        navigation.last,
        navigation.next,
        navigation.prev,
        playback.stop,
    ]);

    // While streaming, follow the latest slide
    useEffect(() => {
        if (!streamingState.isStreaming) return;
        if (streamingSlidesCount <= 0) return;

        const latestIndex = streamingSlidesCount - 1;
        const id = setTimeout(() => {
            navigation.scrollToSlide(latestIndex, "smooth");
        }, 100);

        return () => clearTimeout(id);
    }, [navigation.scrollToSlide, streamingSlidesCount, streamingState.isStreaming]);

    // Reset to first slide when streaming completes
    useEffect(() => {
        if (!streamingState.isComplete) return;
        if (streamingState.isStreaming) return;
        if (streamingSlidesCount <= 0) return;

        const id = setTimeout(() => {
            navigation.scrollToSlide(0, "smooth");
        }, 100);

        return () => clearTimeout(id);
    }, [
        navigation.scrollToSlide,
        streamingSlidesCount,
        streamingState.isComplete,
        streamingState.isStreaming,
    ]);

    const [showIterateModal, setShowIterateModal] = useState(false);

    const handleIteratePresentation = async (
        prompt: string,
        slideCountArg: number,
        detailLevel: string,
        tonality: string,
        useWebResearch: boolean,
    ) => {
        if (!prompt.trim() || !presentationId) return;

        const success = await startIterating(
            prompt,
            presentationId,
            slideCountArg,
            detailLevel,
            tonality,
            useWebResearch,
        );

        if (success) {
            setShowIterateModal(false);
        }
    };

    const deleteCurrentSlide = async () => {
        if (!presentation || presentation.slides.length === 1) return;

        const slideToDelete = presentation.slides[navigation.currentSlide];
        const slideId = slideToDelete?.id;

        const newSlides = presentation.slides.filter((_, idx) => idx !== navigation.currentSlide);

        const newCurrent = Math.min(navigation.currentSlide, Math.max(newSlides.length - 1, 0));

        setPresentation({
            ...presentation,
            slides: newSlides,
            totalSlides: newSlides.length,
        });

        navigation.scrollToSlide(newCurrent, "auto");

        if (presentationId && slideId) {
            try {
                const encodedSlideId = encodeURIComponent(slideId);
                const url = `${API_URL}/api/presentations/${presentationId}/slides/${encodedSlideId}`;

                const response = await fetch(url, {
                    method: "DELETE",
                    credentials: "include",
                });

                if (!response.ok) {
                    const data = await response.json().catch(() => null);
                    console.error("Failed to delete slide from database:", data);
                }
            } catch (error) {
                console.error("Error deleting slide:", error);
            }
        }
    };

    if (shouldShowGenerating) {
        return <CenteredStatusScreen message="Generating your presentation..." />;
    }

    if (isLoading) {
        return <CenteredStatusScreen message="Loading presentation..." />;
    }

    if (!presentation) {
        return null;
    }

    return (
        <div
            className={`min-h-screen transition-all duration-300 ${
                isFullscreenMode ? "bg-transparent p-0" : "bg-transparent p-0"
            }`}
            style={{ height: "100vh", minHeight: "100vh", maxHeight: "100vh" }}
        >
            <div
                className={
                    isFullscreenMode
                        ? "h-screen w-screen flex flex-col"
                        : "max-w-[95vw] mx-auto h-full flex flex-col pt-3"
                }
                style={{ height: "100vh", minHeight: "100vh", maxHeight: "100vh" }}
            >
                {showControls && !isFullscreenMode && (
                    <ViewerHeaderControls
                        title={presentation.title}
                        canIterate={!!presentationId}
                        currentTemplate={currentTemplate}
                        onBack={() =>
                            navigate(isStreamingMode ? ROUTES.generate : ROUTES.presentations)
                        }
                        onTemplateChange={changeTemplate}
                        onIterate={() => setShowIterateModal(true)}
                        intervalMode={intervalMode}
                        slideInterval={slideInterval}
                        customInterval={customInterval}
                        customInputRef={customInputRef}
                        setIntervalMode={setIntervalMode}
                        setSlideInterval={setSlideInterval}
                        setCustomInterval={setCustomInterval}
                        isPlaying={playback.isPlaying}
                        onTogglePlayback={playback.toggle}
                        playbackDisabled={presentation.slides.length === 1}
                        onEnterFullscreen={() => void enterFullscreen()}
                    />
                )}

                <IterateModal
                    open={showIterateModal}
                    onOpenChange={setShowIterateModal}
                    onIterate={handleIteratePresentation}
                    isStreaming={streamingState.isStreaming}
                />

                {!isFullscreenMode && (
                    <ViewerSlideCarousel
                        slides={presentation.slides}
                        currentSlide={navigation.currentSlide}
                        visibleSlide={navigation.visibleSlide}
                        currentTemplate={currentTemplate}
                        containerRef={slideContainerRef}
                        onSelectSlide={(idx) => {
                            if (idx !== navigation.currentSlide) {
                                playback.stop();
                                navigation.scrollToSlide(idx, "smooth");
                            }
                        }}
                    />
                )}

                {showControls && !isFullscreenMode && (
                    <ViewerNavigationControls
                        title={presentation.title}
                        currentSlide={navigation.currentSlide}
                        totalSlides={presentation.slides.length}
                        onFirst={() => {
                            playback.stop();
                            navigation.first();
                        }}
                        onPrev={() => {
                            playback.stop();
                            navigation.prev();
                        }}
                        onNext={() => {
                            playback.stop();
                            navigation.next();
                        }}
                        onLast={() => {
                            playback.stop();
                            navigation.last();
                        }}
                        onDelete={deleteCurrentSlide}
                        deleteDisabled={presentation.slides.length === 1}
                    />
                )}

                {showControls && !isFullscreenMode && (
                    <ViewerThumbnails
                        slides={presentation.slides}
                        currentSlide={navigation.currentSlide}
                        isStreamingMode={isStreamingMode}
                        isStreaming={streamingState.isStreaming}
                        onSelect={(index) => {
                            playback.stop();
                            navigation.scrollToSlide(index, "smooth", { block: "center" });
                        }}
                    />
                )}

                {isFullscreenMode && (
                    <div className="flex-1 flex flex-col items-center justify-center overflow-auto">
                        <div className="ss-slide-stage">
                            <Card className="w-full h-full rounded-none bg-black flex items-center justify-center">
                                <SlideRenderer
                                    slide={presentation.slides[navigation.currentSlide]}
                                    currentTemplate={currentTemplate}
                                    isActive={true}
                                />
                            </Card>
                        </div>
                    </div>
                )}

                {isFullscreenMode && (
                    <ViewerFullscreenOverlayControls
                        showControls={showControls}
                        intervalMode={intervalMode}
                        slideInterval={slideInterval}
                        customInterval={customInterval}
                        customInputRef={customInputRef}
                        setIntervalMode={setIntervalMode}
                        setSlideInterval={setSlideInterval}
                        setCustomInterval={setCustomInterval}
                        isPlaying={playback.isPlaying}
                        onTogglePlayback={playback.toggle}
                        playbackDisabled={presentation.slides.length === 1}
                        currentSlide={navigation.currentSlide}
                        totalSlides={presentation.slides.length}
                        onFirst={() => {
                            playback.stop();
                            navigation.first();
                        }}
                        onPrev={() => {
                            playback.stop();
                            navigation.prev();
                        }}
                        onNext={() => {
                            playback.stop();
                            navigation.next();
                        }}
                        onLast={() => {
                            playback.stop();
                            navigation.last();
                        }}
                        onExit={() => void exitFullscreen()}
                        onMouseEnter={() => setShowControls(true)}
                    />
                )}
            </div>
        </div>
    );
}
