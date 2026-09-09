import { Button } from "@slidesage/ui/components/button";
import {
	PreviewSlide,
	ViewerHeaderControls,
	ViewerNavigationControls,
	ViewerSlideCarousel,
	ViewerThumbnails,
} from "@slidesage/ui/components/Viewer";
import { useFullscreenMode } from "@slidesage/ui/hooks/useFullscreenMode";
import { useSlideNavigation } from "@slidesage/ui/hooks/useSlideNavigation";
import { useTemplatePreviews } from "@slidesage/ui/hooks/useTemplatePreviews";
import { useViewerKeyboardNavigation } from "@slidesage/ui/hooks/useViewerKeyboardNavigation";
import { MARKETPLACE_ITEMS, type MarketplaceItem } from "@slidesage/ui/lib/catalog";
import { useEffect, useRef } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ROUTES } from "../../app/router/paths";

export default function MarketplaceThemePreviewPage() {
	const { marketplaceId } = useParams();
	const item = MARKETPLACE_ITEMS.find((candidate) => candidate.id === marketplaceId);
	if (!item) return <Navigate to={ROUTES.marketplace} replace />;
	return <TemplateViewer key={item.id} item={item} />;
}

function TemplateViewer({ item }: { item: MarketplaceItem }) {
	const navigate = useNavigate();
	const previews = useTemplatePreviews(item.id, item.templateReference.version, item.available);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const slideCount = previews.document?.slides.length ?? 0;
	const navigation = useSlideNavigation({ slideCount, slideContainerRef: containerRef });
	const fullscreen = useFullscreenMode();
	useViewerKeyboardNavigation({
		currentSlide: navigation.currentSlide,
		slideCount,
		onNavigate: (index) => navigation.scrollToSlide(index, "auto"),
		onStopPlayback: () => {},
	});
	useEffect(() => {
		if (!fullscreen.isFullscreenMode) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") void fullscreen.exit();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [fullscreen.isFullscreenMode, fullscreen.exit]);
	return (
		<div
			className={
				fullscreen.isFullscreenMode
					? "presentation-viewer fixed inset-0 z-50 flex flex-col bg-black"
					: "presentation-viewer flex h-dvh min-h-dvh max-h-dvh flex-col bg-transparent p-0"
			}
		>
			<div className="presentation-viewer__shell mx-auto flex h-full min-w-0 w-full max-w-[95vw] flex-1 flex-col pt-3">
				{!fullscreen.isFullscreenMode && (
					<ViewerHeaderControls
						title={item.name}
						canIterate={false}
						showIterate={false}
						templateLabel={item.aspectRatio.label}
						onBack={() => navigate(ROUTES.marketplace)}
						onIterate={() => {}}
						onPresent={() => void fullscreen.enter()}
						presentDisabled={!slideCount}
					/>
				)}
				{!item.available && (
					<p role="status" className="p-6 text-center text-white/60">
						This template is not published yet.
					</p>
				)}
				{previews.error && (
					<div role="alert" className="p-6 text-center">
						<p>{previews.error}</p>
						<Button onClick={previews.retry}>Retry</Button>
					</div>
				)}
				{previews.isLoading && (
					<p role="status" className="text-center text-sm text-white/60">
						Loading template slides…
					</p>
				)}
				{fullscreen.isFullscreenMode && previews.document && (
					<>
						<Button className="self-end" onClick={() => void fullscreen.exit()}>
							Exit presentation
						</Button>
						<div className="min-h-0 flex-1">
							<PreviewSlide
								document={previews.document}
								index={navigation.currentSlide}
								className="w-full"
							/>
						</div>
					</>
				)}
				<div
					hidden={fullscreen.isFullscreenMode}
					aria-hidden={fullscreen.isFullscreenMode}
					className={fullscreen.isFullscreenMode ? "hidden" : "contents"}
				>
					<ViewerSlideCarousel
						document={previews.document}
						visibleSlide={navigation.visibleSlide}
						containerRef={containerRef}
						onSelectSlide={(index) => navigation.scrollToSlide(index, "smooth")}
						isWaitingForFirstSlide={previews.isLoading}
					/>
				</div>
				<ViewerNavigationControls
					currentSlide={navigation.currentSlide}
					totalSlides={slideCount}
					onFirst={() => navigation.first()}
					onPrev={() => navigation.prev()}
					onNext={() => navigation.next()}
					onLast={() => navigation.last()}
					showDownload={false}
				/>
				<p aria-live="polite" className="text-center text-sm text-white/60">
					{slideCount ? `Slide ${navigation.currentSlide + 1} of ${slideCount}` : ""}
				</p>
				{!fullscreen.isFullscreenMode && (
					<ViewerThumbnails
						document={previews.document}
						currentSlide={navigation.currentSlide}
						isStreamingMode={false}
						isStreaming={false}
						onSelect={(index) => navigation.scrollToSlide(index, "smooth")}
					/>
				)}
			</div>
		</div>
	);
}
