import type React from "react";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { Slide } from "@/modules/types/presentation";
import { SlideRenderer } from "./SlideRenderer";

interface ViewerSlideCarouselProps {
    slides: Slide[];
    currentSlide: number;
    visibleSlide: number;
    currentTemplate: string;
    containerRef: React.RefObject<HTMLDivElement | null>;
    onSelectSlide: (index: number) => void;
    isWaitingForFirstSlide?: boolean;
}

export const ViewerSlideCarousel: React.FC<ViewerSlideCarouselProps> = ({
    slides,
    currentSlide,
    visibleSlide,
    currentTemplate,
    containerRef,
    onSelectSlide,
    isWaitingForFirstSlide = false,
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
                {isWaitingForFirstSlide && (
                    <div
                        id="slide-loading"
                        role="option"
                        tabIndex={0}
                        aria-selected="true"
                        aria-label="Waiting for the first generated slide"
                        className="slide-carousel__item"
                    >
                        <div className="ss-slide-stage flex-shrink-0">
                            <Card className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[hsl(222,27%,12%)] shadow-2xl">
                                <div className="flex flex-col items-center gap-4 text-center text-white/70">
                                    <Spinner className="size-8 text-blue-400" />
                                    <div>
                                        <p className="text-sm font-medium text-white/85">
                                            Generating your presentation
                                        </p>
                                        <p className="mt-1 text-xs text-white/40">
                                            Waiting for the first slide
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    </div>
                )}
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
