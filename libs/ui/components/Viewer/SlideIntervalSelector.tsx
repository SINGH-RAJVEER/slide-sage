import { Button } from "@slidesage/ui/components/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@slidesage/ui/components/dropdown-menu";
import { ChevronDown } from "lucide-react";
import type React from "react";

interface SlideIntervalSelectorProps {
    intervalMode: string;
    slideInterval: number;
    customInterval: string;
    isPlaying: boolean;
    isFullscreen: boolean;
    customInputRef: React.RefObject<HTMLInputElement>;
    onIntervalModeChange: (mode: string) => void;
    onSlideIntervalChange: (interval: number) => void;
    onCustomIntervalChange: (interval: string) => void;
    onPlaybackToggle: () => void;
    disabled: boolean;
}

export const SlideIntervalSelector: React.FC<SlideIntervalSelectorProps> = ({
    intervalMode,
    slideInterval,
    customInterval,
    isPlaying,
    isFullscreen,
    customInputRef,
    onIntervalModeChange,
    onSlideIntervalChange,
    onCustomIntervalChange,
    onPlaybackToggle,
    disabled,
}) => {
    return (
        <div className="flex items-center gap-2">
            {intervalMode === "preset" ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            className="w-24 bg-white/10 border-white/20 text-white hover:bg-white/20 transition-all duration-200 justify-between"
                        >
                            <span>{slideInterval}s</span>
                            <ChevronDown className="w-4 h-4 opacity-50" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-32 bg-gray-800/95 backdrop-blur-md border-gray-600">
                        {[2, 3, 5, 10, 15].map((interval) => (
                            <DropdownMenuItem
                                key={interval}
                                onClick={() => {
                                    onSlideIntervalChange(interval);
                                    onCustomIntervalChange(interval.toString());
                                    onIntervalModeChange("preset");
                                }}
                                className="text-white hover:bg-gray-700/50 focus:bg-gray-700/50 cursor-pointer"
                            >
                                {interval}s
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem
                            onClick={() => onIntervalModeChange("custom")}
                            className="text-white hover:bg-gray-700/50 focus:bg-gray-700/50 cursor-pointer"
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
                            onCustomIntervalChange(val);
                        }
                    }}
                    onBlur={() => {
                        let val = Number(customInterval);
                        if (Number.isNaN(val) || val < 0) val = 0;
                        if (val > 10000) val = 10000;
                        onSlideIntervalChange(val);
                        onCustomIntervalChange(val.toString());
                        onIntervalModeChange("preset");
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            let val = Number(customInterval);
                            if (Number.isNaN(val) || val < 0) val = 0;
                            if (val > 10000) val = 10000;
                            onSlideIntervalChange(val);
                            onCustomIntervalChange(val.toString());
                            onIntervalModeChange("preset");
                        } else if (e.key === "Escape") {
                            onIntervalModeChange("preset");
                        }
                    }}
                    className={`w-24 px-3 py-2 rounded-md border ${
                        isFullscreen
                            ? "bg-transparent border-0 shadow-none text-white hover:bg-white/20"
                            : "border-white/20 bg-white/10 text-white hover:bg-white/20"
                    } focus:outline-none focus:ring-2 focus:ring-blue-400 hide-number-spin transition-all duration-200`}
                    placeholder="Custom (s)"
                    inputMode="numeric"
                    style={{ MozAppearance: "textfield" }}
                />
            )}
            <Button
                onClick={onPlaybackToggle}
                variant={isFullscreen ? "ghost" : "outline"}
                className={
                    isFullscreen
                        ? "text-white hover:bg-white/20"
                        : "bg-white/10 border-white/20 text-white hover:bg-white/20 transition-all duration-200"
                }
                disabled={disabled}
            >
                {isPlaying ? "Pause" : "Play"}
            </Button>
        </div>
    );
};
