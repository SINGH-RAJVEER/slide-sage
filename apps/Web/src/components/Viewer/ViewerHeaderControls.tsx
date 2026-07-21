import { ArrowLeft, ChevronDown, Maximize, Pause, Play, Sparkles } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SlideLayoutSelector } from "@/components/Viewer/SlideLayoutSelector";
import TemplateSelector from "@/components/Viewer/TemplateSelector";
import type { SlideLayout } from "@/modules/types/presentation";

interface ViewerHeaderControlsProps {
    title?: string;
    canIterate: boolean;
    currentTemplate: string;
    onBack: () => void;
    onTemplateChange: (templateId: string) => void;
    selectedLayout?: SlideLayout;
    onLayoutChange: (layout: SlideLayout) => void;
    layoutDisabled: boolean;
    onIterate: () => void;

    intervalMode: "preset" | "custom";
    slideInterval: number;
    customInterval: string;
    customInputRef: React.RefObject<HTMLInputElement | null>;
    setIntervalMode: (mode: "preset" | "custom") => void;
    setSlideInterval: (seconds: number) => void;
    setCustomInterval: (seconds: string) => void;

    isPlaying: boolean;
    onTogglePlayback: () => void;
    playbackDisabled: boolean;

    onEnterFullscreen: () => void;
}

export const ViewerHeaderControls: React.FC<ViewerHeaderControlsProps> = ({
    title,
    canIterate,
    currentTemplate,
    onBack,
    onTemplateChange,
    selectedLayout,
    onLayoutChange,
    layoutDisabled,
    onIterate,
    intervalMode,
    slideInterval,
    customInterval,
    customInputRef,
    setIntervalMode,
    setSlideInterval,
    setCustomInterval,
    isPlaying,
    onTogglePlayback,
    playbackDisabled,
    onEnterFullscreen,
}) => {
    return (
        <div
            className="grid flex-shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-4 lg:px-6"
            style={{ minHeight: 48, fontSize: "1rem" }}
        >
            <div className="flex min-w-0 items-center gap-4">
                <Button
                    onClick={onBack}
                    className="bg-transparent hover:bg-white/5 text-white/40 hover:text-white transition-all duration-300 rounded-full p-2 h-10 w-10 border-none shadow-none"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                {title && (
                    <span className="hidden truncate text-lg font-light tracking-wide text-white/60 select-none 2xl:block">
                        {title}
                    </span>
                )}
            </div>

            <div className="flex items-center justify-center gap-2">
                <TemplateSelector
                    selectedTemplate={currentTemplate}
                    onTemplateChange={onTemplateChange}
                />
                <SlideLayoutSelector
                    selectedLayout={selectedLayout}
                    onLayoutChange={onLayoutChange}
                    disabled={layoutDisabled}
                />
                {canIterate && (
                    <Button
                        onClick={onIterate}
                        variant="outline"
                        className="bg-white/5 hover:bg-white/10 backdrop-blur-lg border border-white/5 text-white transition-all duration-300"
                    >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Iterate
                    </Button>
                )}
            </div>

            <div className="flex items-center justify-end gap-2">
                {intervalMode === "preset" ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                className="w-24 bg-transparent border-white/5 text-white/60 hover:text-white hover:bg-white/5 transition-all duration-200 justify-between h-9 px-3"
                            >
                                <span>{slideInterval}s</span>
                                <ChevronDown className="w-4 h-4 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-32 bg-gray-900/95 backdrop-blur-md border border-white/10 text-white shadow-xl">
                            {[2, 3, 5, 10, 15].map((val) => (
                                <DropdownMenuItem
                                    key={val}
                                    onClick={() => {
                                        setSlideInterval(val);
                                        setCustomInterval(val.toString());
                                        setIntervalMode("preset");
                                    }}
                                    className="focus:bg-white/10 focus:text-white cursor-pointer"
                                >
                                    {val}s
                                </DropdownMenuItem>
                            ))}
                            <DropdownMenuItem
                                onClick={() => setIntervalMode("custom")}
                                className="focus:bg-white/10 focus:text-white cursor-pointer"
                            >
                                Custom
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <input
                        ref={customInputRef}
                        type="number"
                        min={0}
                        max={10000}
                        value={customInterval}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (/^\d{0,5}$/.test(val) && Number(val) <= 10000) {
                                setCustomInterval(val);
                            }
                        }}
                        onBlur={() => {
                            let val = Number(customInterval);
                            if (Number.isNaN(val) || val < 0) val = 0;
                            if (val > 10000) val = 10000;
                            setSlideInterval(val);
                            setCustomInterval(val.toString());
                            setIntervalMode("preset");
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                let val = Number(customInterval);
                                if (Number.isNaN(val) || val < 0) val = 0;
                                if (val > 10000) val = 10000;
                                setSlideInterval(val);
                                setCustomInterval(val.toString());
                                setIntervalMode("preset");
                            } else if (e.key === "Escape") {
                                setIntervalMode("preset");
                            }
                        }}
                        className="w-24 px-3 py-2 rounded-md bg-transparent border border-white/5 text-white/60 hover:text-white hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-white/20 hide-number-spin transition-all duration-200 h-9"
                        placeholder="Custom (s)"
                        inputMode="numeric"
                        style={{ MozAppearance: "textfield" }}
                    />
                )}

                <Button
                    onClick={onTogglePlayback}
                    variant="outline"
                    className="bg-transparent border-white/5 text-white/60 hover:text-white hover:bg-white/5 transition-all duration-200 h-9 px-3"
                    disabled={playbackDisabled}
                >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onEnterFullscreen}
                    className="text-white/60 hover:text-white hover:bg-white/5 h-9 w-9"
                >
                    <Maximize className="h-5 w-5" />
                </Button>
            </div>
        </div>
    );
};
