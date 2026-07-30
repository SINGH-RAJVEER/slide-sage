import { Spinner } from "@slide-sage/ui/components/spinner";
import type React from "react";
import type { Slide } from "@/modules/types/presentation";
import { ScaledSlide } from "./ScaledSlide";
import { SlideRenderer } from "./SlideRenderer";

export const ViewerThumbnails: React.FC<{
    slides: Slide[];
    currentSlide: number;
    isStreamingMode: boolean;
    isStreaming: boolean;
    currentTemplate: string;
    onSelect: (index: number) => void;
}> = ({ slides, currentSlide, isStreamingMode, isStreaming, currentTemplate, onSelect }) => {
    return (
        <div
            className="viewer-thumbnails w-full overflow-hidden flex-shrink-0 relative"
            style={{ minHeight: 40 }}
        >
            <div className="slide-thumbnails-container flex gap-3 overflow-x-auto py-6 px-4 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                {slides.map((slide, index) => {
                    const isFirstThumbnail = index === 0;
                    const isLastThumbnail =
                        index === slides.length - 1 && !(isStreamingMode && isStreaming);
                    const marginLeft = isFirstThumbnail ? "calc(50% - 64px)" : "0";
                    const marginRight = isLastThumbnail ? "calc(50% - 64px)" : "0";

                    return (
                        <button
                            key={slide.id || index}
                            type="button"
                            data-slide-index={index}
                            aria-label={`Go to slide ${index + 1}`}
                            onClick={() => onSelect(index)}
                            style={{
                                marginLeft,
                                marginRight,
                            }}
                            className={`w-32 h-[4.5rem] border-2 rounded-lg flex-shrink-0 transition-all duration-300 overflow-hidden
                ${
                    currentSlide === index
                        ? "border-blue-500 bg-blue-500/20 shadow-lg shadow-blue-500/50"
                        : "border-white/20 bg-white/10 hover:border-white/40 hover:bg-white/20"
                }
                backdrop-blur-sm relative`}
                        >
                            <div className="relative h-full w-full bg-black">
                                <ScaledSlide className="pointer-events-none">
                                    <SlideRenderer
                                        slide={slide}
                                        currentTemplate={currentTemplate}
                                        isActive={false}
                                    />
                                </ScaledSlide>
                                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                    {index + 1}
                                </span>
                            </div>
                        </button>
                    );
                })}

                {isStreamingMode && isStreaming && (
                    <div
                        style={{
                            marginRight: "calc(50% - 64px)",
                        }}
                        className="w-32 h-[4.5rem] border-2 border-dashed border-blue-400/50 rounded-lg flex-shrink-0 overflow-hidden backdrop-blur-sm bg-blue-500/10 flex items-center justify-center"
                    >
                        <Spinner className="size-5 text-blue-400" />
                    </div>
                )}
            </div>
        </div>
    );
};
