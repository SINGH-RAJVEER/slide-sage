import { Button } from "@slidesage/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@slidesage/ui/components/dropdown-menu";
import { ChevronDown } from "lucide-react";
import type React from "react";

interface SlideCountSelectorProps {
	slideCountMode: string;
	slideCount: string;
	customSlideCount: string;
	onSlideCountModeChange: (mode: string) => void;
	onSlideCountChange: (count: string) => void;
	onCustomSlideCountChange: (count: string) => void;
}

export const SlideCountSelector: React.FC<SlideCountSelectorProps> = ({
	slideCountMode,
	slideCount,
	customSlideCount,
	onSlideCountModeChange,
	onSlideCountChange,
	onCustomSlideCountChange,
}) => {
	return (
		<div className="flex items-center">
			{slideCountMode === "preset" ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							className="h-12 px-5 text-white/70 hover:text-white hover:bg-white/5 transition-all text-base font-light flex gap-3 items-center rounded-lg"
						>
							<span className="opacity-50">Length:</span>
							<span className="text-white">{slideCount} Slides</span>
							<ChevronDown className="h-4 w-4 opacity-50" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-32 border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl text-white rounded-xl">
						{[5, 10, 15, 20, 25, 30].map((count) => (
							<DropdownMenuItem
								key={count}
								onClick={() => {
									onSlideCountChange(count.toString());
									onCustomSlideCountChange(count.toString());
									onSlideCountModeChange("preset");
								}}
								className="text-white/80 focus:text-white focus:bg-white/10 cursor-pointer rounded-lg my-1"
							>
								{count} slides
							</DropdownMenuItem>
						))}
						<DropdownMenuItem
							onClick={() => onSlideCountModeChange("custom")}
							className="text-white/80 focus:text-white focus:bg-white/10 cursor-pointer border-t border-white/10 mt-1 pt-2 rounded-lg"
						>
							Custom...
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			) : (
				<div className="flex items-center gap-2 h-9 px-3 bg-white/5 rounded-lg border border-white/10">
					<span className="text-white/50 text-sm font-light">Length:</span>
					<input
						type="number"
						min={1}
						max={40}
						value={customSlideCount}
						onChange={(e) => {
							const val = e.target.value;
							// Allow empty string or numbers up to 40
							if (val === "" || (/^\d{0,2}$/.test(val) && Number(val) <= 40)) {
								onCustomSlideCountChange(val);
							}
						}}
						onBlur={() => {
							// On blur, revert to preset if invalid or empty, otherwise save
							let val = Number(customSlideCount);
							if (Number.isNaN(val) || val < 1) {
								onSlideCountModeChange("preset");
							} else {
								if (val > 40) val = 40;
								onCustomSlideCountChange(val.toString());
								onSlideCountChange(val.toString());
								// Keep in custom mode but sanitized
							}
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								// Commit
								let val = Number(customSlideCount);
								if (Number.isNaN(val) || val < 1) val = 1;
								if (val > 40) val = 40;
								onCustomSlideCountChange(val.toString());
								onSlideCountChange(val.toString());
								// Switch back to preset if it matches one? No, just keep custom.
								// Actually user might want to submit form, but this is a selector.
								e.currentTarget.blur();
							} else if (e.key === "Escape") {
								onSlideCountModeChange("preset");
							}
						}}
						className="w-12 bg-transparent text-white border-0 p-0 text-sm focus:ring-0 text-center"
						placeholder="#"
					/>
					<div className="hidden">
						{/* Hidden controls to match original structure if needed, but not needed */}
					</div>
					<button
						type="button"
						onClick={() => onSlideCountModeChange("preset")}
						className="text-white/40 hover:text-white transition-colors"
					>
						<ChevronDown className="h-3 w-3" />
					</button>
				</div>
			)}
		</div>
	);
};
