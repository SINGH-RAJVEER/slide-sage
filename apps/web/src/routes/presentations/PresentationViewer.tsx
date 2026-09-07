import { BINARY_PPTX_TEMPLATE_CATALOG, type PresentationData } from "@slidesage/types";
import { useStreaming } from "@slidesage/ui";
import {
	CenteredStatusScreen,
	IterateModal,
	type PresentationExporter,
	PptxSlide,
	ViewerFullscreenOverlayControls,
	ViewerHeaderControls,
	ViewerNavigationControls,
	ViewerSlideCarousel,
	ViewerThumbnails,
} from "@slidesage/ui/components/Viewer";
import { useAutoHideControls } from "@slidesage/ui/hooks/useAutoHideControls";
import { useFullscreenMode } from "@slidesage/ui/hooks/useFullscreenMode";
import { usePlayback } from "@slidesage/ui/hooks/usePlayback";
import {
	usePresentationData,
	type ViewerLocationState,
} from "@slidesage/ui/hooks/usePresentationData";
import { usePptxRevision } from "@slidesage/ui/hooks/usePptxRevision";
import { useSlideNavigation } from "@slidesage/ui/hooks/useSlideNavigation";
import { useViewerKeyboardNavigation } from "@slidesage/ui/hooks/useViewerKeyboardNavigation";
import { API_URL } from "@slidesage/ui/lib/api";
import { requestGenerationNotificationPermission } from "@slidesage/ui/lib/generation-notifications";
import { fetchPresentationRevision } from "@slidesage/ui/lib/presentation-revision";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ROUTES } from "../../app/router/paths";
import { useVimMode } from "../../context/VimModeContext";

function templateLabelFor(reference?: PresentationData["template"]): string | undefined {
	return BINARY_PPTX_TEMPLATE_CATALOG.find(
		(candidate) => candidate.id === reference?.id && candidate.version === reference.version,
	)?.name;
}

export default function PresentationViewerPage() {
	const location = useLocation();
	const navigate = useNavigate();
	const params = useParams();
	const { streamingState, getPresentation, generate, cancelGeneration } = useStreaming();
	const { isVimMode } = useVimMode();

	const locationState = location.state as ViewerLocationState | undefined;

	const presentationIdFromParams = useMemo(() => {
		return params["presentationId"] || undefined;
	}, [params["presentationId"]]);

	const isStreamingMode = locationState?.isStreaming === true;

	const {
		presentation,
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

	// The deck is the committed revision, so the viewer renders the package
	// itself rather than a separate description of it.
	const { document: pptxDocument, isLoading: isRevisionLoading } = usePptxRevision(
		presentationId,
		presentation?.currentRevision?.revision,
	);

	const slideContainerRef = useRef<HTMLDivElement | null>(null);
	const slideCount = pptxDocument?.slides.length ?? 0;
	const navigation = useSlideNavigation({ slideCount, slideContainerRef });

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

	// Show the deck from its first slide once the finished revision is parsed.
	useEffect(() => {
		if (slideCount === 0) return;
		const id = setTimeout(() => {
			navigation.scrollToSlide(0, "smooth");
		}, 100);
		return () => clearTimeout(id);
	}, [navigation.scrollToSlide, slideCount]);

	const [showIterateModal, setShowIterateModal] = useState(false);
	const [isCancelling, setIsCancelling] = useState(false);

	const handleIteratePresentation = async (
		prompt: string,
		slideCountArg: number,
		detailLevel: string,
		tonality: string,
		useWebResearch: boolean,
	) => {
		if (!prompt.trim() || !presentationId || !presentation?.template) return;
		requestGenerationNotificationPermission();

		const success = await generate({
			prompt,
			slideCount: slideCountArg,
			detailLevel,
			tonality,
			researchEnabled: useWebResearch,
			parentPresentationId: presentationId,
			template: presentation.template,
		});

		if (success) {
			setShowIterateModal(false);
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

	// Download serves the revision's exact bytes; the deck is already a PPTX, so
	// there is nothing to convert and nothing that can diverge from what renders.
	const exportPresentation: PresentationExporter = async (_format, presentationToExport) => {
		if (!presentationId) return;
		const bytes = await fetchPresentationRevision(presentationId);
		const url = URL.createObjectURL(
			new Blob([bytes], {
				type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
			}),
		);
		try {
			const link = document.createElement("a");
			link.href = url;
			link.download = `${presentationToExport.title || "presentation"}.pptx`;
			link.click();
		} finally {
			URL.revokeObjectURL(url);
		}
	};

	if (isLoading) {
		return <CenteredStatusScreen message="Loading presentation..." />;
	}

	if (!presentation && !shouldShowGenerating) {
		return null;
	}

	const viewerTitle = presentation?.title ?? streamingState.prompt ?? "Untitled presentation";
	const hasSlides = slideCount > 0;
	const isWaitingForDeck = shouldShowGenerating || isRevisionLoading;
	const canCancelGeneration =
		shouldShowGenerating &&
		streamingState.operation === "generation" &&
		streamingState.isStreaming &&
		streamingSlidesCount === 0 &&
		!!streamingState.jobId;

	// ViewerNavigationControls reports deck metadata; while a deck is still
	// generating there is no committed revision to describe yet.
	const navigationPresentation: PresentationData = presentation ?? {
		title: viewerTitle,
		template: streamingState.template ?? { id: "", version: 0 },
		documentKind: "pptx",
		totalSlides: 0,
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
						title={viewerTitle}
						canIterate={hasSlides && !!presentationId}
						templateLabel={templateLabelFor(presentation?.template)}
						onBack={() => navigate(isStreamingMode ? ROUTES.generate : ROUTES.presentations)}
						onIterate={() => setShowIterateModal((current) => !current)}
						onPresent={() => void enterFullscreen()}
						presentDisabled={!hasSlides}
					/>
				)}

				{!isFullscreenMode && (
					<ViewerSlideCarousel
						document={pptxDocument}
						visibleSlide={navigation.visibleSlide}
						containerRef={slideContainerRef}
						isWaitingForFirstSlide={isWaitingForDeck}
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
						presentation={navigationPresentation}
						currentSlide={navigation.currentSlide}
						totalSlides={slideCount}
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
						onCancelGeneration={canCancelGeneration ? handleCancelGeneration : undefined}
						cancelDisabled={isCancelling}
						onExport={exportPresentation}
					/>
				)}

				{showControls && !isFullscreenMode && (
					<ViewerThumbnails
						document={pptxDocument}
						currentSlide={navigation.currentSlide}
						isStreamingMode={isStreamingMode}
						isStreaming={streamingState.isStreaming || shouldShowGenerating}
						onSelect={(index) => {
							playback.stop();
							navigation.scrollToSlide(index, "smooth", { block: "center" });
						}}
					/>
				)}

				{isFullscreenMode && pptxDocument && hasSlides && (
					<div className="min-h-0 flex-1 bg-black">
						<PptxSlide
							document={pptxDocument}
							index={navigation.currentSlide}
							className="h-full w-full"
						/>
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
						playbackDisabled={slideCount <= 1}
						currentSlide={navigation.currentSlide}
						totalSlides={slideCount}
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
