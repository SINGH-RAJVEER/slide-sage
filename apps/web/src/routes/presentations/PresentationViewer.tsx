import type { BinaryTemplateSelection, SceneSlide } from "@slidesage/types";
import {
	BINARY_PPTX_TEMPLATE_CATALOG,
	type ContentSlide,
	DEFAULT_BINARY_PPTX_TEMPLATE,
	isContentSlide,
	type PresentationData,
	type SlideLayout,
} from "@slidesage/types";
import { useStreaming, useTemplate } from "@slidesage/ui";
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
import { useAutoHideControls } from "@slidesage/ui/hooks/useAutoHideControls";
import { useFullscreenMode } from "@slidesage/ui/hooks/useFullscreenMode";
import { useInstalledMarketplaceThemes } from "@slidesage/ui/hooks/useInstalledMarketplaceThemes";
import { usePlayback } from "@slidesage/ui/hooks/usePlayback";
import {
	usePresentationData,
	type ViewerLocationState,
} from "@slidesage/ui/hooks/usePresentationData";
import { useSlideNavigation } from "@slidesage/ui/hooks/useSlideNavigation";
import { useViewerKeyboardNavigation } from "@slidesage/ui/hooks/useViewerKeyboardNavigation";
import { API_URL } from "@slidesage/ui/lib/api";
import { requestGenerationNotificationPermission } from "@slidesage/ui/lib/generation-notifications";
import { exportOoxmlTemplatePptx } from "@slidesage/ui/lib/ooxml-template-export";
import { persistPresentationMutations } from "@slidesage/ui/lib/presentation-mutations";
import { applySlideLayout } from "@slidesage/ui/lib/slide-layout";
import { findTemplate } from "@slidesage/ui/lib/templates";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ROUTES } from "@/app/router/paths";
import { useVimMode } from "@/context/VimModeContext";

function resolveTemplateSelection(
	reference?: PresentationData["template"],
): BinaryTemplateSelection {
	const template = BINARY_PPTX_TEMPLATE_CATALOG.find(
		(candidate) => candidate.id === reference?.id && candidate.version === reference.version,
	);
	return {
		id: template?.id ?? DEFAULT_BINARY_PPTX_TEMPLATE.id,
		version: template?.version ?? DEFAULT_BINARY_PPTX_TEMPLATE.version,
		previewThemeId: template?.previewThemeId ?? DEFAULT_BINARY_PPTX_TEMPLATE.previewThemeId,
	};
}

export default function PresentationViewerPage() {
	const location = useLocation();
	const navigate = useNavigate();
	const params = useParams();
	const { streamingState, getPresentation, generate, cancelGeneration } = useStreaming();
	const { currentTemplate, changeTemplate } = useTemplate();
	const installedThemes = useInstalledMarketplaceThemes();
	const { isVimMode } = useVimMode();

	const locationState = location.state as ViewerLocationState | undefined;
	const [selectedTemplate, setSelectedTemplate] = useState(() =>
		resolveTemplateSelection(locationState?.presentation?.template ?? streamingState.template),
	);

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

	// Sync the persisted theme into the selector when opening an existing deck. A manual
	// choice during generation takes precedence over stale stream events, including while
	// the viewer is showing its pre-slide skeleton.
	const appliedThemeRef = useRef<string | null>(null);
	const hasManualThemeSelectionRef = useRef(false);
	const pendingTemplateRef = useRef<BinaryTemplateSelection | null>(null);
	const persistPendingTemplateRef = useRef<(template: BinaryTemplateSelection) => void>(() => {});
	const templateSaveSequenceRef = useRef(0);
	useEffect(() => {
		const theme = presentation?.theme;
		if (!theme || theme === appliedThemeRef.current) return;
		if (!findTemplate(theme)) return;
		if (hasManualThemeSelectionRef.current) return;
		appliedThemeRef.current = theme;
		changeTemplate(theme);
	}, [presentation?.theme, changeTemplate, streamingState.isStreaming]);

	useEffect(() => {
		if (!presentation?.template || hasManualThemeSelectionRef.current) return;
		const selection = resolveTemplateSelection(presentation.template);
		setSelectedTemplate(selection);
		changeTemplate(selection.previewThemeId);
	}, [presentation?.template, changeTemplate]);

	useEffect(() => {
		const pendingTemplate = pendingTemplateRef.current;
		if (
			!pendingTemplate ||
			streamingState.isStreaming ||
			!streamingState.isComplete ||
			!presentationId
		) {
			return;
		}
		pendingTemplateRef.current = null;
		persistPendingTemplateRef.current(pendingTemplate);
	}, [presentationId, streamingState.isComplete, streamingState.isStreaming]);

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
		enabled: isVimMode,
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
	const [pendingSlides, setPendingSlides] = useState<Record<string, ContentSlide | SceneSlide>>({});
	const [fullscreenSlideReady, setFullscreenSlideReady] = useState(false);
	const [isCancelling, setIsCancelling] = useState(false);

	const handleIteratePresentation = async (
		prompt: string,
		slideCountArg: number,
		detailLevel: string,
		tonality: string,
		useWebResearch: boolean,
	) => {
		if (!prompt.trim() || !presentationId) return;
		requestGenerationNotificationPermission();

		const success = await generate({
			prompt,
			slideCount: slideCountArg,
			detailLevel,
			tonality,
			researchEnabled: useWebResearch,
			parentPresentationId: presentationId,
			template: selectedTemplate,
		});

		if (success) {
			setShowIterateModal(false);
		}
	};

	const deleteCurrentSlide = async () => {
		if (!presentation || presentation.slides.length === 1) return;

		const slideToDelete = presentation.slides[navigation.currentSlide];
		const slideId = slideToDelete?.id;
		if (!slideId) return;

		const newSlides = presentation.slides.filter((_, idx) => idx !== navigation.currentSlide);

		const newCurrent = Math.min(navigation.currentSlide, Math.max(newSlides.length - 1, 0));

		setPresentation({
			...presentation,
			slides: newSlides,
			totalSlides: newSlides.length,
		});
		setPendingSlides((current) => {
			const { [slideId]: _, ...remaining } = current;
			return remaining;
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

	const handleCancelGeneration = async () => {
		setIsCancelling(true);
		const cancelled = await cancelGeneration();
		if (cancelled) {
			navigate(ROUTES.generate, { replace: true });
			return;
		}
		setIsCancelling(false);
	};

	const exportPresentation: PresentationExporter = async (format, presentationToExport) => {
		if (format === "pptx") {
			await exportOoxmlTemplatePptx(presentationToExport, {
				publicBaseUrl: import.meta.env["VITE_PPTX_TEMPLATE_BASE_URL"] || "",
			});
			return;
		}
		const { exportPresentationPdf } = await import("@slidesage/ui/lib/pdf-export");
		await exportPresentationPdf(presentationToExport, currentTemplate);
	};

	if (isLoading) {
		return <CenteredStatusScreen message="Loading presentation..." />;
	}

	if (!presentation && !shouldShowGenerating) {
		return null;
	}

	const baseViewerPresentation =
		presentation ||
		({
			title: streamingState.prompt || "Untitled presentation",
			theme: streamingState.theme || currentTemplate,
			template: streamingState.template,
			slides: [],
			totalSlides: 0,
		} satisfies PresentationData);
	const viewerPresentation = baseViewerPresentation;
	const hasSlides = viewerPresentation.slides.length > 0;
	const canCancelGeneration =
		shouldShowGenerating &&
		streamingState.operation === "generation" &&
		streamingState.isStreaming &&
		streamingState.slides.length === 0 &&
		!!streamingState.jobId;
	const activeSlide = viewerPresentation.slides[navigation.currentSlide];
	const activeDraftSlide = activeSlide ? pendingSlides[activeSlide.id] : undefined;
	const activeContentSlide = activeSlide && isContentSlide(activeSlide) ? activeSlide : undefined;

	const handleTemplateChange = async (template: BinaryTemplateSelection) => {
		const saveSequence = ++templateSaveSequenceRef.current;
		const previousTheme = presentation?.theme || currentTemplate;
		const previousTemplate = selectedTemplate;
		hasManualThemeSelectionRef.current = true;
		appliedThemeRef.current = template.previewThemeId;
		setSelectedTemplate(template);
		changeTemplate(template.previewThemeId);
		setPresentation((current) =>
			current
				? {
						...current,
						theme: template.previewThemeId,
						template: { id: template.id, version: template.version },
					}
				: current,
		);
		if (streamingState.isStreaming || !presentationId) {
			pendingTemplateRef.current = template;
			return;
		}
		try {
			const saved = await persistPresentationMutations(presentationId, [
				{
					type: "update-presentation",
					theme: template.previewThemeId,
					template: { id: template.id, version: template.version },
				},
			]);
			setPresentation(saved);
		} catch (error) {
			console.error("Failed to save presentation template:", error);
			if (templateSaveSequenceRef.current !== saveSequence) return;
			changeTemplate(previousTheme);
			setSelectedTemplate(previousTemplate);
			setPresentation((current) =>
				current?.template?.id === template.id
					? {
							...current,
							theme: previousTheme,
							template: {
								id: previousTemplate.id,
								version: previousTemplate.version,
							},
						}
					: current,
			);
		}
	};
	persistPendingTemplateRef.current = (template) => void handleTemplateChange(template);

	const handleLayoutChange = async (layout: SlideLayout) => {
		if (!presentation) return;
		const selected = presentation.slides[navigation.currentSlide];
		if (!selected || !isContentSlide(selected)) return;
		const contentSlide = selected;
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

	const savePendingSlide = async () => {
		const active = presentation?.slides[navigation.currentSlide];
		if (!active) return;
		const pending = pendingSlides[active.id];
		if (!pending) return;
		await saveCanvasEdit(pending);
		setPendingSlides((current) => {
			if (current[pending.id] !== pending) return current;
			const { [pending.id]: _, ...remaining } = current;
			return remaining;
		});
	};

	return (
		<div className="presentation-viewer flex h-dvh min-h-dvh max-h-dvh bg-transparent p-0">
			<div
				className={
					isFullscreenMode
						? "flex h-dvh w-screen flex-col"
						: "presentation-viewer__shell mx-auto flex h-full min-w-0 w-full max-w-[95vw] flex-1 flex-col pt-3"
				}
			>
				{showControls && !isFullscreenMode && (
					<ViewerHeaderControls
						title={viewerPresentation.title}
						canIterate={hasSlides && !!presentationId}
						currentTemplate={currentTemplate}
						selectedTemplate={selectedTemplate}
						onBack={() => navigate(isStreamingMode ? ROUTES.generate : ROUTES.presentations)}
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
						onSelectSlide={(idx) => {
							if (idx !== navigation.currentSlide) {
								playback.stop();
								navigation.scrollToSlide(idx, "smooth");
							}
						}}
						onSlideChange={(slide) =>
							setPendingSlides((current) => ({ ...current, [slide.id]: slide }))
						}
						draftSlide={activeDraftSlide}
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
						onCancelGeneration={canCancelGeneration ? handleCancelGeneration : undefined}
						cancelDisabled={isCancelling}
						onSave={pendingSlides[activeSlide?.id || ""] ? savePendingSlide : undefined}
						saveDisabled={savingEdit}
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
