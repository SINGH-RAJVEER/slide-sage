import { Button } from "@slide-sage/ui/components/button";
import { Globe } from "lucide-react";
import type React from "react";
import type { ThemeId } from "@/modules/types/presentation";
import { DetailLevelSelector } from "./DetailLevelSelector";
import { GenerationThemeSelector } from "./GenerationThemeSelector";
import { SlideCountSelector } from "./SlideCountSelector";
import { TonalitySelector } from "./TonalitySelector";

interface GenerateOptionsBarProps {
    detailLevel: string;
    tonality: string;
    useWebResearch: boolean;
    slideCountMode: string;
    slideCount: string;
    customSlideCount: string;
    theme: ThemeId;
    onDetailLevelChange: (level: string) => void;
    onTonalityChange: (tonality: string) => void;
    onUseWebResearchChange: (enabled: boolean) => void;
    onSlideCountModeChange: (mode: string) => void;
    onSlideCountChange: (count: string) => void;
    onCustomSlideCountChange: (count: string) => void;
    onThemeChange: (theme: ThemeId) => void;
}

export const GenerateOptionsBar: React.FC<GenerateOptionsBarProps> = ({
    detailLevel,
    tonality,
    useWebResearch,
    slideCountMode,
    slideCount,
    customSlideCount,
    theme,
    onDetailLevelChange,
    onTonalityChange,
    onUseWebResearchChange,
    onSlideCountModeChange,
    onSlideCountChange,
    onCustomSlideCountChange,
    onThemeChange,
}) => {
    return (
        <div className="mb-2 w-full flex items-center justify-center">
            <div className="flex w-fit max-w-full flex-nowrap items-center justify-start gap-3 overflow-x-auto whitespace-nowrap rounded-lg border border-white/10 bg-black/20 px-4 py-3 custom-scrollbar xl:justify-center">
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
                <GenerationThemeSelector theme={theme} onThemeChange={onThemeChange} />
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
