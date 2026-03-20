import { Loader2, Maximize, Sparkles } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import DownloadPPTXButton from "./DownloadPDFButton";
import { SlideIntervalSelector } from "./SlideIntervalSelector";
import TemplateSelector from "./TemplateSelector";

interface HeaderControlsProps {
    currentSlide: number;
    totalSlides: number;
    isStreamingMode: boolean;
    isStreaming: boolean;
    selectedTemplate: string;
    intervalMode: string;
    slideInterval: number;
    customInterval: string;
    isPlaying: boolean;
    customInputRef: React.RefObject<HTMLInputElement>;
    onBackClick: () => void;
    onTemplateChange: (templateId: string) => void;
    onIterateClick: () => void;
    onIntervalModeChange: (mode: string) => void;
    onSlideIntervalChange: (interval: number) => void;
    onCustomIntervalChange: (interval: string) => void;
    onPlaybackToggle: () => void;
    onFullscreenClick: () => void;
    presentationTitle: string;
    hasPresentationId: boolean;
}

export const HeaderControls: React.FC<HeaderControlsProps> = ({
    currentSlide,
    totalSlides,
    isStreamingMode,
    isStreaming,
    selectedTemplate,
    intervalMode,
    slideInterval,
    customInterval,
    isPlaying,
    customInputRef,
    onBackClick,
    onTemplateChange,
    onIterateClick,
    onIntervalModeChange,
    onSlideIntervalChange,
    onCustomIntervalChange,
    onPlaybackToggle,
    onFullscreenClick,
    presentationTitle,
    hasPresentationId,
}) => {
    return (
        <div
            className="relative flex items-center justify-between bg-white/10 backdrop-blur-md rounded-2xl px-6 py-3 border border-white/20 flex-shrink-0"
            style={{ minHeight: 48, fontSize: "1rem" }}
        >
            <div className="flex items-center gap-4">
                <Button
                    onClick={onBackClick}
                    variant="outline"
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                >
                    ←
                </Button>
                <TemplateSelector
                    selectedTemplate={selectedTemplate}
                    onTemplateChange={onTemplateChange}
                />
                {hasPresentationId && (
                    <Button
                        onClick={onIterateClick}
                        variant="outline"
                        className="bg-white/10 border-white/20 text-white hover:bg-white/20 transition-all duration-200"
                    >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Iterate
                    </Button>
                )}
            </div>
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/80 text-sm font-medium select-none pointer-events-none bg-white/10 border border-white/20 px-4 py-1 rounded-full shadow-sm flex items-center gap-2">
                {isStreamingMode && isStreaming && <Loader2 className="w-3 h-3 animate-spin" />}
                Slide {currentSlide + 1} of {totalSlides}
            </span>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <SlideIntervalSelector
                        intervalMode={intervalMode}
                        slideInterval={slideInterval}
                        customInterval={customInterval}
                        isPlaying={isPlaying}
                        isFullscreen={false}
                        customInputRef={customInputRef}
                        onIntervalModeChange={onIntervalModeChange}
                        onSlideIntervalChange={onSlideIntervalChange}
                        onCustomIntervalChange={onCustomIntervalChange}
                        onPlaybackToggle={onPlaybackToggle}
                        disabled={totalSlides === 1}
                    />
                    <Button
                        onClick={onFullscreenClick}
                        variant="outline"
                        className="bg-white/10 border-white/20 text-white hover:bg-white/20 transition-all duration-200"
                    >
                        <Maximize className="w-4 h-4 mr-2" />
                        Fullscreen
                    </Button>
                    <DownloadPPTXButton title={presentationTitle} />
                </div>
            </div>
        </div>
    );
};
