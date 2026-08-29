import { Card } from "@slidesage/ui/components/card";
import { ScaledSlide } from "@slidesage/ui/components/Viewer/ScaledSlide";
import { SlideRenderer } from "@slidesage/ui/components/Viewer/SlideRenderer";
import { ViewerFullscreenOverlayControls } from "@slidesage/ui/components/Viewer/ViewerFullscreenOverlayControls";
import { ViewerHeaderControls } from "@slidesage/ui/components/Viewer/ViewerHeaderControls";
import { ViewerNavigationControls } from "@slidesage/ui/components/Viewer/ViewerNavigationControls";
import { ViewerSlideCarousel } from "@slidesage/ui/components/Viewer/ViewerSlideCarousel";
import { ViewerThumbnails } from "@slidesage/ui/components/Viewer/ViewerThumbnails";
import { useAutoHideControls } from "@slidesage/ui/hooks/useAutoHideControls";
import { useFullscreenMode } from "@slidesage/ui/hooks/useFullscreenMode";
import { usePlayback } from "@slidesage/ui/hooks/usePlayback";
import { useSlideNavigation } from "@slidesage/ui/hooks/useSlideNavigation";
import { useViewerKeyboardNavigation } from "@slidesage/ui/hooks/useViewerKeyboardNavigation";
import { createMarketplacePreviewPresentation, MARKETPLACE_ITEMS } from "@slidesage/ui/lib/catalog";
import { useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ROUTES } from "@/app/router/paths";
import { useVimMode } from "@/context/VimModeContext";

export default function MarketplaceThemePreviewPage() {
	const navigate = useNavigate();
	const { isVimMode } = useVimMode();
	const { marketplaceId } = useParams();
	const item = MARKETPLACE_ITEMS.find((candidate) => candidate.id === marketplaceId);
	const presentation = item ? createMarketplacePreviewPresentation(item) : undefined;
	const slideContainerRef = useRef<HTMLDivElement | null>(null);
	const navigation = useSlideNavigation({
		slideCount: presentation?.slides.length ?? 0,
		slideContainerRef,
	});
	const { isFullscreenMode, enter: enterFullscreen, exit: exitFullscreen } = useFullscreenMode();
	const { showControls, setShowControls } = useAutoHideControls({ enabled: isFullscreenMode });
	const [slideInterval, setSlideInterval] = useState(5);
	const [intervalMode, setIntervalMode] = useState<"preset" | "custom">("preset");
	const [customInterval, setCustomInterval] = useState("5");
	const [fullscreenSlideReady, setFullscreenSlideReady] = useState(false);
	const customInputRef = useRef<HTMLInputElement | null>(null);
	const playback = usePlayback({
		slideCount: presentation?.slides.length ?? 0,
		currentSlide: navigation.currentSlide,
		slideIntervalSeconds: slideInterval,
		onAdvance: (nextIndex) => navigation.scrollToSlide(nextIndex, "smooth"),
	});
	useViewerKeyboardNavigation({
		enabled: isVimMode,
		currentSlide: navigation.currentSlide,
		slideCount: presentation?.slides.length ?? 0,
		onNavigate: (index) => navigation.scrollToSlide(index, "auto"),
		onStopPlayback: playback.stop,
	});

	if (!item || !presentation) return <Navigate to={ROUTES.marketplace} replace />;

	const activeSlide = presentation.slides[navigation.currentSlide];
	const stopAndNavigate = (action: () => void) => {
		playback.stop();
		action();
	};

	return (
		<div className="flex h-dvh min-h-dvh max-h-dvh bg-transparent p-0">
			<div
				className={
					isFullscreenMode
						? "flex h-dvh w-screen flex-col"
						: "mx-auto flex h-full min-w-0 w-full max-w-[95vw] flex-1 flex-col pt-3"
				}
			>
				{showControls && !isFullscreenMode && (
					<ViewerHeaderControls
						title={presentation.title}
						canIterate={false}
						currentTemplate={item.themeId}
						themeLabel={item.name}
						showIterate={false}
						showLayoutSelector={false}
						onBack={() => navigate(ROUTES.marketplace)}
						onTemplateChange={() => undefined}
						onLayoutChange={() => undefined}
						layoutDisabled={true}
						onIterate={() => undefined}
						onPresent={() => void enterFullscreen()}
					/>
				)}

				{!isFullscreenMode && (
					<ViewerSlideCarousel
						slides={presentation.slides}
						currentSlide={navigation.currentSlide}
						visibleSlide={navigation.visibleSlide}
						currentTemplate={item.themeId}
						containerRef={slideContainerRef}
						onSelectSlide={(index) =>
							stopAndNavigate(() => navigation.scrollToSlide(index, "smooth"))
						}
					/>
				)}

				{showControls && !isFullscreenMode && (
					<ViewerNavigationControls
						presentation={presentation}
						currentSlide={navigation.currentSlide}
						totalSlides={presentation.slides.length}
						onFirst={() => stopAndNavigate(navigation.first)}
						onPrev={() => stopAndNavigate(navigation.prev)}
						onNext={() => stopAndNavigate(navigation.next)}
						onLast={() => stopAndNavigate(navigation.last)}
						onDelete={() => undefined}
						deleteDisabled={true}
						showDownload={false}
						showDelete={false}
					/>
				)}

				{showControls && !isFullscreenMode && (
					<ViewerThumbnails
						slides={presentation.slides}
						currentSlide={navigation.currentSlide}
						isStreamingMode={false}
						isStreaming={false}
						currentTemplate={item.themeId}
						onSelect={(index) => stopAndNavigate(() => navigation.scrollToSlide(index, "smooth"))}
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
									currentTemplate={item.themeId}
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
						playbackDisabled={presentation.slides.length <= 1}
						currentSlide={navigation.currentSlide}
						totalSlides={presentation.slides.length}
						onFirst={() => stopAndNavigate(navigation.first)}
						onPrev={() => stopAndNavigate(navigation.prev)}
						onNext={() => stopAndNavigate(navigation.next)}
						onLast={() => stopAndNavigate(navigation.last)}
						onExit={() => void exitFullscreen()}
						onMouseEnter={() => setShowControls(true)}
					/>
				)}
			</div>
		</div>
	);
}
