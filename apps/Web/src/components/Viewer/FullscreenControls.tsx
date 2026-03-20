import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { SlideIntervalSelector } from "./SlideIntervalSelector";

interface FullscreenControlsProps {
    showControls: boolean;
    intervalMode: string;
    slideInterval: number;
    customInterval: string;
    isPlaying: boolean;
    currentSlide: number;
    totalSlides: number;
    customInputRef: React.RefObject<HTMLInputElement>;
    onIntervalModeChange: (mode: string) => void;
    onSlideIntervalChange: (interval: number) => void;
    onCustomIntervalChange: (interval: string) => void;
    onPlaybackToggle: () => void;
    onPrevSlide: () => void;
    onNextSlide: () => void;
    onFirstSlide: () => void;
    onLastSlide: () => void;
    onExitFullscreen: () => void;
}

export const FullscreenControls: React.FC<FullscreenControlsProps> = ({
    showControls,
    intervalMode,
    slideInterval,
    customInterval,
    isPlaying,
    currentSlide,
    totalSlides,
    customInputRef,
    onIntervalModeChange,
    onSlideIntervalChange,
    onCustomIntervalChange,
    onPlaybackToggle,
    onPrevSlide,
    onNextSlide,
    onFirstSlide,
    onLastSlide,
    onExitFullscreen,
}) => {
    const isFirstSlide = currentSlide === 0;
    const isLastSlide = currentSlide === totalSlides - 1;

    return (
        <div
            className={`
        fixed bottom-4 left-1/2 transform -translate-x-1/2 
        flex items-center gap-4 bg-black/50 backdrop-blur-md rounded-full px-6 py-3
        transition-opacity duration-300
        ${showControls ? "opacity-100" : "opacity-0"}
      `}
        >
            {/* Interval Selector and Play/Pause Button */}
            <SlideIntervalSelector
                intervalMode={intervalMode}
                slideInterval={slideInterval}
                customInterval={customInterval}
                isPlaying={isPlaying}
                isFullscreen={true}
                customInputRef={customInputRef}
                onIntervalModeChange={onIntervalModeChange}
                onSlideIntervalChange={onSlideIntervalChange}
                onCustomIntervalChange={onCustomIntervalChange}
                onPlaybackToggle={onPlaybackToggle}
                disabled={totalSlides === 1}
            />

            {/* Navigation and Exit Buttons */}
            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    onClick={onFirstSlide}
                    disabled={isFirstSlide}
                    className="text-white hover:bg-white/20"
                >
                    <SkipBack className="w-5 h-5" />
                </Button>
                <Button
                    variant="ghost"
                    onClick={onPrevSlide}
                    disabled={isFirstSlide}
                    className="text-white hover:bg-white/20"
                >
                    <ChevronLeft className="w-5 h-5" />
                </Button>
                <Button
                    variant="ghost"
                    onClick={onNextSlide}
                    disabled={isLastSlide}
                    className="text-white hover:bg-white/20"
                >
                    <ChevronRight className="w-5 h-5" />
                </Button>
                <Button
                    variant="ghost"
                    onClick={onLastSlide}
                    disabled={isLastSlide}
                    className="text-white hover:bg-white/20"
                >
                    <SkipForward className="w-5 h-5" />
                </Button>
                <Button
                    variant="ghost"
                    onClick={onExitFullscreen}
                    className="text-white hover:bg-white/20"
                >
                    Exit
                </Button>
            </div>
        </div>
    );
};
