import { Slider, SliderThumb } from "@slidesage/ui/components/slider";
import type React from "react";

interface SlideCountSelectorProps {
	slideCount: string;
	onSlideCountChange: (count: string) => void;
}

export const SlideCountSelector: React.FC<SlideCountSelectorProps> = ({
	slideCount,
	onSlideCountChange,
}) => {
	return (
		<div className="flex items-center gap-3">
			<span className="text-sm font-light whitespace-nowrap text-white/50">Slide count</span>
			<Slider
				value={[Number(slideCount)]}
				min={5}
				max={40}
				step={1}
				className="w-36"
				onValueChange={(values) => onSlideCountChange(values[0]?.toString() ?? "5")}
			>
				<SliderThumb aria-label="Slide count">{slideCount}</SliderThumb>
			</Slider>
		</div>
	);
};
