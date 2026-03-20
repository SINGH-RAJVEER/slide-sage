import type React from "react";
import { Card } from "@/components/ui/card";
import type { Slide } from "@/modules/types/presentation";
import { SlideRenderer } from "./SlideRenderer";

interface ViewerSlideCarouselProps {
    slides: Slide[];
    currentSlide: number;
    visibleSlide: number;
    currentTemplate: string;
    containerRef: React.RefObject<HTMLDivElement | null>;
    onSelectSlide: (index: number) => void;
}

export const ViewerSlideCarousel: React.FC<ViewerSlideCarouselProps> = ({
    slides,
    currentSlide,
    visibleSlide,
    currentTemplate,
    containerRef,
    onSelectSlide,
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
                    const isActive = visibleSlide === idx;

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
                            <div className="ss-slide-stage flex-shrink-0 cursor-pointer">
                                <Card
                                    className={`w-full h-full rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 flex items-stretch ${
                                        currentSlide === idx ? "ring-2 ring-blue-500" : ""
                                    }`}
                                >
                                    <SlideRenderer
                                        slide={slide}
                                        currentTemplate={currentTemplate}
                                        isActive={currentSlide === idx}
                                    />
                                </Card>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
