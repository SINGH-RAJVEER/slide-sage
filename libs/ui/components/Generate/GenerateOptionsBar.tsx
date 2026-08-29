import { Button } from "@slidesage/ui/components/button";
import { Globe } from "lucide-react";
import type React from "react";
import { DetailLevelSelector } from "./DetailLevelSelector";
import { SlideCountSelector } from "./SlideCountSelector";
import { TonalitySelector } from "./TonalitySelector";

interface GenerateOptionsBarProps {
	detailLevel: string;
	tonality: string;
	useWebResearch: boolean;
	slideCount: string;
	onDetailLevelChange: (level: string) => void;
	onTonalityChange: (tonality: string) => void;
	onUseWebResearchChange: (enabled: boolean) => void;
	onSlideCountChange: (count: string) => void;
}

export const GenerateOptionsBar: React.FC<GenerateOptionsBarProps> = ({
	detailLevel,
	tonality,
	useWebResearch,
	slideCount,
	onDetailLevelChange,
	onTonalityChange,
	onUseWebResearchChange,
	onSlideCountChange,
}) => {
	return (
		<div className="mb-2 w-full flex items-center justify-center">
			<div className="flex w-full max-w-full flex-wrap items-center justify-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-3 sm:w-fit sm:flex-nowrap sm:justify-start sm:gap-3 sm:overflow-x-auto sm:px-4 sm:whitespace-nowrap sm:custom-scrollbar xl:justify-center">
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
						<span className="flex items-center gap-2 text-sm leading-4 font-medium">
							<Globe className="size-4 shrink-0" />
							<span className="translate-y-px">Web Research</span>
						</span>
					</Button>
				</div>

				<DetailLevelSelector detailLevel={detailLevel} onDetailLevelChange={onDetailLevelChange} />
				<TonalitySelector tonality={tonality} onTonalityChange={onTonalityChange} />
				<SlideCountSelector slideCount={slideCount} onSlideCountChange={onSlideCountChange} />
			</div>
		</div>
	);
};
