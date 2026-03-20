import type React from "react";
import { Card } from "@/components/ui/card";
import type { Slide } from "@/modules/types/presentation";

interface SlideCarouselProps {
    slides: Slide[];
    currentSlide: number;
    visibleSlide: number;
    containerRef: React.RefObject<HTMLDivElement>;
    onSlideClick: (index: number) => void;
    renderSlideContent: (slide: Slide, isActive: boolean) => React.ReactNode;
}

export const SlideCarousel: React.FC<SlideCarouselProps> = ({
    slides,
    currentSlide,
    visibleSlide,
    containerRef,
    onSlideClick,
    renderSlideContent,
}) => {
    return (
        <div
            className="flex-1 mt-3 flex flex-col"
            style={{ maxHeight: "calc(100vh - 40px - 28px - 48px - 56px)" }}
        >
            <div
                ref={containerRef}
                className="slide-carousel w-full flex-1"
                role="listbox"
                aria-label="Slides carousel"
            >
                {slides.map((slide, idx) => {
                    const isFirstSlide = idx === 0;
                    const isLastSlide = idx === slides.length - 1;
                    const marginLeft = isFirstSlide ? "calc((100vw - 75vw) / 2 - 2rem)" : "0";
                    const marginRight = isLastSlide ? "calc((100vw - 75vw) / 2 - 2rem)" : "0";
                    const isActive = visibleSlide === idx;

                    return (
                        <div
                            key={slide.id}
                            id={`slide-${slide.id}`}
                            role="option"
                            aria-selected={isActive}
                            tabIndex={0}
                            className="slide-carousel__item"
                            data-active={isActive}
                            style={{
                                width: "75vw",
                                minWidth: "75vw",
                                maxWidth: "75vw",
                                marginLeft,
                                marginRight,
                            }}
                            onClick={() => onSlideClick(idx)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    onSlideClick(idx);
                                }
                            }}
                        >
                            <div className="w-full aspect-video flex-shrink-0 cursor-pointer">
                                <Card
                                    className={`w-full h-full rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 flex items-stretch ${
                                        currentSlide === idx ? "ring-2 ring-blue-500" : ""
                                    }`}
                                >
                                    {renderSlideContent(slide, currentSlide === idx)}
                                </Card>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
