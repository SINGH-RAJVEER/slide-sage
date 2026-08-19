import type { ContentSlide, Slide } from "@slidesage/types";
import { isContentSlide, isSceneSlide, type SceneSlide } from "@slidesage/types";
import { Card } from "@slidesage/ui/components/card";
import { Spinner } from "@slidesage/ui/components/spinner";
import type React from "react";
import { EditableSceneCanvas } from "./EditableSceneCanvas";
import { EditableSlideCanvas } from "./EditableSlideCanvas";
import { ScaledSlide } from "./ScaledSlide";
import { SlideRenderer } from "./SlideRenderer";

interface ViewerSlideCarouselProps {
	slides: Slide[];
	currentSlide: number;
	visibleSlide: number;
	currentTemplate: string;
	containerRef: React.RefObject<HTMLDivElement | null>;
	onSelectSlide: (index: number) => void;
	isWaitingForFirstSlide?: boolean;
	draftSlide?: ContentSlide | SceneSlide;
	onSlideChange?: (slide: ContentSlide | SceneSlide) => void;
}

export const ViewerSlideCarousel: React.FC<ViewerSlideCarouselProps> = ({
	slides,
	currentSlide,
	visibleSlide,
	currentTemplate,
	containerRef,
	onSelectSlide,
	isWaitingForFirstSlide = false,
	draftSlide,
	onSlideChange,
}) => {
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
						aria-label="Waiting for the first generated slide"
						className="slide-carousel__item"
					>
						<div className="h-full w-full">
							<Card className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[hsl(222,27%,12%)] shadow-2xl">
								<div className="flex items-center justify-center text-white/70">
									<Spinner className="size-8 text-blue-400" />
								</div>
							</Card>
						</div>
					</div>
				)}
				{slides.map((slide, idx) => {
					const isActive = visibleSlide === idx;
					const editableSlide =
						currentSlide === idx && draftSlide?.id === slide.id ? draftSlide : slide;

					return (
						// biome-ignore lint/a11y/useKeyWithClickEvents: click only
						// biome-ignore lint/a11y/useFocusableInteractive: mouse-based carousel
						<div
							key={slide.id || idx}
							id={`slide-${idx}`}
							role="option"
							aria-selected={isActive}
							className="slide-carousel__item"
							data-active={isActive}
							onClick={() => onSelectSlide(idx)}
						>
							<ScaledSlide className="cursor-pointer rounded-2xl" fit="width">
								<Card className="w-full h-full rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 flex items-stretch">
									{currentSlide === idx && onSlideChange ? (
										isSceneSlide(editableSlide) ? (
											<EditableSceneCanvas
												slide={editableSlide}
												currentTemplate={currentTemplate}
												onChange={onSlideChange}
											/>
										) : isContentSlide(editableSlide) ? (
											<EditableSlideCanvas
												slide={editableSlide}
												currentTemplate={currentTemplate}
												onChange={onSlideChange}
											/>
										) : (
											<SlideRenderer
												slide={slide}
												currentTemplate={currentTemplate}
												isActive={currentSlide === idx}
											/>
										)
									) : (
										<SlideRenderer
											slide={slide}
											currentTemplate={currentTemplate}
											isActive={currentSlide === idx}
										/>
									)}
								</Card>
							</ScaledSlide>
						</div>
					);
				})}
			</div>
		</div>
	);
};
