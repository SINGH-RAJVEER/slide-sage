import { Loader2 } from "lucide-react";
import type React from "react";

interface SlideThumbnailsProps {
    slides: Array<{ id: string }>;
    currentSlide: number;
    isStreamingMode: boolean;
    isStreaming: boolean;
    onThumbnailClick: (index: number) => void;
}

export const SlideThumbnails: React.FC<SlideThumbnailsProps> = ({
    slides,
    currentSlide,
    isStreamingMode,
    isStreaming,
    onThumbnailClick,
}) => {
    return (
        <div className="w-full overflow-hidden flex-shrink-0 relative" style={{ minHeight: 40 }}>
            <div className="slide-thumbnails-container flex gap-3 overflow-x-auto py-6 px-4 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                {slides.map((slide, index) => {
                    const isFirstThumbnail = index === 0;
                    const isLastThumbnail =
                        index === slides.length - 1 && !(isStreamingMode && isStreaming);
                    const marginLeft = isFirstThumbnail ? "calc(50vw - 40px)" : "0";
                    const marginRight = isLastThumbnail ? "calc(50vw - 40px)" : "0";

                    return (
                        <button
                            key={slide.id}
                            type="button"
                            data-slide-index={index}
                            onClick={() => onThumbnailClick(index)}
                            style={{
                                marginLeft,
                                marginRight,
                            }}
                            className={`w-20 h-14 border-2 rounded-xl flex-shrink-0 transition-all duration-300 overflow-hidden
                ${
                    currentSlide === index
                        ? "border-blue-500 bg-blue-500/20 shadow-lg shadow-blue-500/50"
                        : "border-white/20 bg-white/10 hover:border-white/40 hover:bg-white/20"
                }
                backdrop-blur-sm relative`}
                        >
                            <div className="w-full h-full flex items-center justify-center">
                                <span className="text-sm text-white font-medium">{index + 1}</span>
                            </div>
                        </button>
                    );
                })}
                {/* Streaming loading indicator */}
                {isStreamingMode && isStreaming && (
                    <div
                        style={{
                            marginRight: "calc(50vw - 40px)",
                        }}
                        className="w-20 h-14 border-2 border-dashed border-blue-400/50 rounded-xl flex-shrink-0 overflow-hidden backdrop-blur-sm bg-blue-500/10 flex items-center justify-center"
                    >
                        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                    </div>
                )}
            </div>
        </div>
    );
};
