import { Card } from "@slidesage/ui/components/card";
import { ThinkingOrb } from "@slidesage/ui/components/thinking-orb";
import type React from "react";
import type { PptxDocument } from "../../lib/pptx-document";
import { PptxSlide } from "./PptxSlide";

interface ViewerSlideCarouselProps {
	document: PptxDocument | null;
	visibleSlide: number;
	containerRef: React.RefObject<HTMLDivElement | null>;
	onSelectSlide: (index: number) => void;
	isWaitingForFirstSlide?: boolean;
}

export const ViewerSlideCarousel: React.FC<ViewerSlideCarouselProps> = ({
	document,
	visibleSlide,
	containerRef,
	onSelectSlide,
	isWaitingForFirstSlide = false,
}) => {
	const slideCount = document?.slides.length ?? 0;

	return (
		<div
			className="viewer-slide-area flex-1 mt-3 flex flex-col"
			style={{ maxHeight: "calc(100dvh - 40px - 28px - 48px - 56px)" }}
		>
			<div
				ref={containerRef}
				className="slide-carousel w-full flex-1"
				role="listbox"
				aria-label="Slides carousel"
			>
				{isWaitingForFirstSlide && (
					<div
						id="slide-loading"
						role="option"
						tabIndex={0}
						aria-selected="true"
						aria-label="Waiting for the rendered presentation"
						className="slide-carousel__item"
					>
						<div className="h-full w-full">
							<Card className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[hsl(222,27%,12%)] shadow-2xl">
								<div className="flex items-center justify-center">
									<ThinkingOrb size={64} aria-label="Loading" />
								</div>
							</Card>
						</div>
					</div>
				)}
				{document &&
					Array.from({ length: slideCount }, (_, index) => {
						const isActive = visibleSlide === index;

						return (
							// biome-ignore lint/a11y/useKeyWithClickEvents: click only
							// biome-ignore lint/a11y/useFocusableInteractive: mouse-based carousel
							<div
								key={index}
								id={`slide-${index}`}
								role="option"
								aria-selected={isActive}
								className="slide-carousel__item"
								data-active={isActive}
								onClick={() => onSelectSlide(index)}
							>
								<Card className="w-full h-full cursor-pointer rounded-2xl shadow-2xl overflow-hidden bg-white transition-all duration-300 flex items-stretch">
									<PptxSlide document={document} index={index} className="w-full" />
								</Card>
							</div>
						);
					})}
			</div>
		</div>
	);
};
