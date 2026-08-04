import type { SceneSlide } from "@slidesage/types";
import { Card } from "@slidesage/ui/components/card";
import {
    CenteredStatusScreen,
    IterateModal,
    type PresentationExporter,
    ScaledSlide,
    SlideRenderer,
    ViewerFullscreenOverlayControls,
    ViewerHeaderControls,
    ViewerNavigationControls,
    ViewerSlideCarousel,
    ViewerThumbnails,
} from "@slidesage/ui/components/Viewer";
import { adaptLegacyHtmlSlide } from "@slidesage/ui/lib/legacy-slide-adapter";
import { AVAILABLE_TEMPLATES } from "@slidesage/ui/lib/templates";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAutoHideControls } from "@/hooks/useAutoHideControls";
import { useFullscreenMode } from "@/hooks/useFullscreenMode";
import { useInstalledMarketplaceThemes } from "@/hooks/useInstalledMarketplaceThemes";
import { usePlayback } from "@/hooks/usePlayback";
import type { ViewerLocationState } from "@/hooks/usePresentationData";
import { usePresentationData } from "@/hooks/usePresentationData";
import { useSlideNavigation } from "@/hooks/useSlideNavigation";
import { useViewerKeyboardNavigation } from "@/hooks/useViewerKeyboardNavigation";
import { API_URL } from "@/lib/api";
import { requestGenerationNotificationPermission } from "@/lib/generation-notifications";
import { getGenerationDisplayStatus } from "@/lib/generation-status";
import { persistPresentationMutations } from "@/lib/presentation-mutations";
import { applySlideLayout } from "@/lib/slide-layout";
// Import directly from source modules (not the @/modules/presentations barrel) to avoid a
// circular dependency: the barrel re-exports this very page, which under circular evaluation
// left the AVAILABLE_TEMPLATES binding unestablished (ReferenceError at render).
import { useStreaming } from "@/modules/contexts/StreamingContext";
import {
    type ContentSlide,
    isContentSlide,
    isLegacyHtmlSlide,
    type PresentationData,
    type SlideLayout,
    type ThemeId,
} from "@/modules/types/presentation";
import { useTemplate } from "@/modules/useTemplate";
import { ROUTES } from "@/router/paths";

export default function PresentationViewerPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const params = useParams();
    const { streamingState, getPresentation, startIterating } = useStreaming();
    const { currentTemplate, changeTemplate } = useTemplate();
    const installedThemes = useInstalledMarketplaceThemes();

    const locationState = location.state as ViewerLocationState | undefined;

    const presentationIdFromParams = useMemo(() => {
        return params["presentationId"] || undefined;
    }, [params["presentationId"]]);

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

    // Sync the AI-chosen theme into the template selector. We only apply it when the theme
    // value itself changes (tracked via ref) so that a manual template selection isn't
    // overridden on every re-render, and we ignore unknown values so a stray theme string
    // from the model can't blank out the styling.
    const appliedThemeRef = useRef<string | null>(null);
    const templateSaveSequenceRef = useRef(0);
    useEffect(() => {
        const theme = streamingState.theme || presentation?.theme;
        if (!theme || theme === appliedThemeRef.current) return;
        if (!AVAILABLE_TEMPLATES.some((t) => t.id === theme)) return;
        appliedThemeRef.current = theme;
        changeTemplate(theme);
    }, [streamingState.theme, presentation?.theme, changeTemplate]);

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

    useViewerKeyboardNavigation({
        currentSlide: navigation.currentSlide,
        slideCount,
        onNavigate: (index) => navigation.scrollToSlide(index, "auto"),
        onStopPlayback: playback.stop,
    });

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

    // Once streaming finishes and we have an ID, move to the canonical URL so reloads work
    useEffect(() => {
        if (!streamingState.isComplete || streamingState.isStreaming) return;
        const id = streamingState.presentationId ?? presentationId;
        if (!id || params["presentationId"]) return;
        navigate(ROUTES.presentationById(id), { replace: true });
    }, [
        streamingState.isComplete,
        streamingState.isStreaming,
        streamingState.presentationId,
        presentationId,
        params,
        navigate,
    ]);

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
    const [savingEdit, setSavingEdit] = useState(false);
    const [fullscreenSlideReady, setFullscreenSlideReady] = useState(false);

    const handleIteratePresentation = async (
        prompt: string,
        slideCountArg: number,
        detailLevel: string,
        tonality: string,
        useWebResearch: boolean,
    ) => {
        if (!prompt.trim() || !presentationId) return;
        requestGenerationNotificationPermission();

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
                const saved = await persistPresentationMutations(presentationId, [
                    { type: "delete-slide", slideId },
                ]);
                setPresentation(saved);
            } catch (error) {
                console.error("Error deleting slide:", error);
                setPresentation((current) => {
                    if (!current || current.slides.some((slide) => slide.id === slideId)) {
                        return current;
                    }
                    const slides = [...current.slides];
                    slides.splice(navigation.currentSlide, 0, slideToDelete);
                    return { ...current, slides, totalSlides: slides.length };
                });
            }
        }
    };

    const exportPresentation: PresentationExporter = async (format, presentationToExport) => {
        if (format === "pptx") {
            const { exportEditablePptx } = await import("@/lib/pptx-export");
            await exportEditablePptx(presentationToExport);
            return;
        }
        const { exportPresentationPdf } = await import("@/lib/pdf-export");
        await exportPresentationPdf(presentationToExport.title);
    };

    if (isLoading) {
        return <CenteredStatusScreen message="Loading presentation..." />;
    }

    if (!presentation && !shouldShowGenerating) {
        return null;
    }

    const viewerPresentation =
        presentation ||
        ({
            title: streamingState.prompt || "Generating presentation",
            theme: streamingState.theme || currentTemplate,
            slides: [],
            totalSlides: 0,
        } satisfies PresentationData);
    const hasSlides = viewerPresentation.slides.length > 0;
    const generationStatus = getGenerationDisplayStatus(streamingState);
    const activeSlide = viewerPresentation.slides[navigation.currentSlide];
    const activeContentSlide =
        activeSlide && isContentSlide(activeSlide)
            ? activeSlide
            : activeSlide && isLegacyHtmlSlide(activeSlide)
              ? adaptLegacyHtmlSlide(activeSlide)
              : undefined;

    const handleTemplateChange = async (templateId: string) => {
        const saveSequence = ++templateSaveSequenceRef.current;
        const previousTheme = presentation?.theme || currentTemplate;
        changeTemplate(templateId);
        setPresentation((current) => (current ? { ...current, theme: templateId } : current));
        if (!presentationId) return;
        try {
            const saved = await persistPresentationMutations(presentationId, [
                { type: "update-presentation", theme: templateId as ThemeId },
            ]);
            setPresentation(saved);
        } catch (error) {
            console.error("Failed to save presentation theme:", error);
            if (templateSaveSequenceRef.current !== saveSequence) return;
            changeTemplate(previousTheme);
            setPresentation((current) =>
                current?.theme === templateId ? { ...current, theme: previousTheme } : current,
            );
        }
    };

    const handleLayoutChange = async (layout: SlideLayout) => {
        if (!presentation) return;
        const selected = presentation.slides[navigation.currentSlide];
        if (!selected || (!isContentSlide(selected) && !isLegacyHtmlSlide(selected))) return;
        const contentSlide = isLegacyHtmlSlide(selected)
            ? adaptLegacyHtmlSlide(selected)
            : selected;
        const updatedSlide = applySlideLayout(contentSlide, layout);
        const slides = [...presentation.slides];
        slides[navigation.currentSlide] = updatedSlide;
        setPresentation({ ...presentation, slides });
        if (!presentationId) return;
        try {
            const saved = await persistPresentationMutations(presentationId, [
                { type: "update-slide", slideId: updatedSlide.id, slide: updatedSlide },
            ]);
            setPresentation(saved);
        } catch (error) {
            console.error("Failed to save slide layout:", error);
            setPresentation((current) => {
                if (!current) return current;
                const currentSlides = current.slides.map((slide) =>
                    slide.id === contentSlide.id ? contentSlide : slide,
                );
                return { ...current, slides: currentSlides };
            });
        }
    };

    const saveCanvasEdit = async (slide: ContentSlide | SceneSlide) => {
        if (!presentation) return;
        setSavingEdit(true);
        const previous = presentation;
        setPresentation({
            ...presentation,
            slides: presentation.slides.map((item) => (item.id === slide.id ? slide : item)),
        });
        try {
            if (presentationId) {
                const saved = await persistPresentationMutations(presentationId, [
                    { type: "update-slide", slideId: slide.id, slide },
                ]);
                setPresentation(saved);
            }
        } catch (error) {
            setPresentation(previous);
            console.error("Failed to save canvas edit:", error);
            throw error;
        } finally {
            setSavingEdit(false);
        }
    };

    return (
        <div
            className="presentation-viewer flex min-h-screen bg-transparent p-0"
            style={{ height: "100vh", minHeight: "100vh", maxHeight: "100vh" }}
        >
            <div
                className={
                    isFullscreenMode
                        ? "h-screen w-screen flex flex-col"
                        : "presentation-viewer__shell mx-auto flex h-full min-w-0 w-full max-w-[95vw] flex-1 flex-col pt-3"
                }
                style={{ height: "100vh", minHeight: "100vh", maxHeight: "100vh" }}
            >
                {showControls && !isFullscreenMode && (
                    <ViewerHeaderControls
                        title={viewerPresentation.title}
                        canIterate={hasSlides && !!presentationId}
                        currentTemplate={currentTemplate}
                        onBack={() =>
                            navigate(isStreamingMode ? ROUTES.generate : ROUTES.presentations)
                        }
                        onTemplateChange={handleTemplateChange}
                        installedThemes={installedThemes}
                        selectedLayout={activeContentSlide?.layout}
                        onLayoutChange={handleLayoutChange}
                        layoutDisabled={!activeContentSlide}
                        showLayoutSelector={false}
                        onIterate={() => setShowIterateModal((current) => !current)}
                        onPresent={() => void enterFullscreen()}
                        presentDisabled={!hasSlides}
                    />
                )}

                {!isFullscreenMode && (
                    <ViewerSlideCarousel
                        slides={viewerPresentation.slides}
                        currentSlide={navigation.currentSlide}
                        visibleSlide={navigation.visibleSlide}
                        currentTemplate={currentTemplate}
                        containerRef={slideContainerRef}
                        isWaitingForFirstSlide={shouldShowGenerating}
                        generationMessage={generationStatus.message}
                        generationProgress={generationStatus.progress}
                        onSelectSlide={(idx) => {
                            if (idx !== navigation.currentSlide) {
                                playback.stop();
                                navigation.scrollToSlide(idx, "smooth");
                            }
                        }}
                        savingEdit={savingEdit}
                        onSaveEdit={saveCanvasEdit}
                        onCancelEdit={() => undefined}
                    />
                )}

                {showControls && !isFullscreenMode && (
                    <ViewerNavigationControls
                        presentation={viewerPresentation}
                        currentSlide={navigation.currentSlide}
                        totalSlides={viewerPresentation.slides.length}
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
                        deleteDisabled={viewerPresentation.slides.length <= 1}
                        onExport={exportPresentation}
                    />
                )}

                {showControls && !isFullscreenMode && (
                    <ViewerThumbnails
                        slides={viewerPresentation.slides}
                        currentSlide={navigation.currentSlide}
                        isStreamingMode={isStreamingMode}
                        isStreaming={streamingState.isStreaming || shouldShowGenerating}
                        currentTemplate={currentTemplate}
                        onSelect={(index) => {
                            playback.stop();
                            navigation.scrollToSlide(index, "smooth", { block: "center" });
                        }}
                    />
                )}

                {isFullscreenMode && activeSlide && (
                    <div className="min-h-0 flex-1 bg-black">
                        <ScaledSlide
                            key={activeSlide.id}
                            className="ss-slide-enter"
                            stageClassName="shadow-2xl"
                            onReadyChange={setFullscreenSlideReady}
                        >
                            <Card className="h-full w-full overflow-hidden rounded-none border-0 bg-black">
                                <SlideRenderer
                                    key={`${activeSlide.id}-${fullscreenSlideReady ? "ready" : "measuring"}`}
                                    slide={activeSlide}
                                    currentTemplate={currentTemplate}
                                    isActive={fullscreenSlideReady}
                                />
                            </Card>
                        </ScaledSlide>
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
                        playbackDisabled={viewerPresentation.slides.length <= 1}
                        currentSlide={navigation.currentSlide}
                        totalSlides={viewerPresentation.slides.length}
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
            {!isFullscreenMode && (
                <IterateModal
                    open={showIterateModal}
                    onOpenChange={setShowIterateModal}
                    onIterate={handleIteratePresentation}
                    isStreaming={streamingState.isStreaming}
                />
            )}
        </div>
    );
}
