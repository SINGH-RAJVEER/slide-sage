import { Globe } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { DetailLevelSelector } from "./DetailLevelSelector";
import { SlideCountSelector } from "./SlideCountSelector";
import { TonalitySelector } from "./TonalitySelector";

interface GenerateOptionsBarProps {
    detailLevel: string;
    tonality: string;
    useWebResearch: boolean;
    slideCountMode: string;
    slideCount: string;
    customSlideCount: string;
    onDetailLevelChange: (level: string) => void;
    onTonalityChange: (tonality: string) => void;
    onUseWebResearchChange: (enabled: boolean) => void;
    onSlideCountModeChange: (mode: string) => void;
    onSlideCountChange: (count: string) => void;
    onCustomSlideCountChange: (count: string) => void;
}

export const GenerateOptionsBar: React.FC<GenerateOptionsBarProps> = ({
    detailLevel,
    tonality,
    useWebResearch,
    slideCountMode,
    slideCount,
    customSlideCount,
    onDetailLevelChange,
    onTonalityChange,
    onUseWebResearchChange,
    onSlideCountModeChange,
    onSlideCountChange,
    onCustomSlideCountChange,
}) => {
    return (
        <div className="mb-2 w-full flex items-center justify-center">
            <div className="w-fit flex flex-nowrap items-center justify-center gap-3 rounded-lg border border-white/10 bg-black/20 px-4 py-3 whitespace-nowrap overflow-x-auto custom-scrollbar">
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onUseWebResearchChange(!useWebResearch)}
                        className={`h-10 rounded-md border px-4 transition-colors ${
                            useWebResearch
                                ? "border-white/20 bg-white/10 text-white"
                                : "border-transparent bg-transparent text-white/60 hover:bg-white/5 hover:text-white"
                        }`}
                    >
                        <span className="flex items-center gap-2 text-sm font-medium">
                            <Globe className="h-4 w-4" />
                            Web Research
                        </span>
                    </Button>
                </div>

                <DetailLevelSelector
                    detailLevel={detailLevel}
                    onDetailLevelChange={onDetailLevelChange}
                />
                <TonalitySelector tonality={tonality} onTonalityChange={onTonalityChange} />
                <SlideCountSelector
                    slideCountMode={slideCountMode}
                    slideCount={slideCount}
                    customSlideCount={customSlideCount}
                    onSlideCountModeChange={onSlideCountModeChange}
                    onSlideCountChange={onSlideCountChange}
                    onCustomSlideCountChange={onCustomSlideCountChange}
                />
            </div>
        </div>
    );
};
