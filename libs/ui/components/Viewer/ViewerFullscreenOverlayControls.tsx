import { Button } from "@slidesage/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@slidesage/ui/components/select";
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type React from "react";

interface ViewerFullscreenOverlayControlsProps {
	showControls: boolean;
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

	currentSlide: number;
	totalSlides: number;
	onFirst: () => void;
	onPrev: () => void;
	onNext: () => void;
	onLast: () => void;
	onExit: () => void;
	onMouseEnter: () => void;
}

export const ViewerFullscreenOverlayControls: React.FC<ViewerFullscreenOverlayControlsProps> = ({
	showControls,
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
	currentSlide,
	totalSlides,
	onFirst,
	onPrev,
	onNext,
	onLast,
	onExit,
	onMouseEnter,
}) => {
	return (
		<div
			className={`
				fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2
				flex flex-col gap-2 rounded-2xl bg-black/50 px-3 py-3 backdrop-blur-md
				sm:w-auto sm:max-w-none sm:flex-row sm:gap-4 sm:rounded-full sm:px-6
				transition-opacity duration-300
				${showControls ? "opacity-100" : "pointer-events-none opacity-0"}
			`}
			onPointerEnter={onMouseEnter}
		>
			<div className="flex w-full items-center gap-2 sm:w-auto">
				{intervalMode === "preset" ? (
					<Select
						value={slideInterval.toString()}
						onValueChange={(v) => {
							if (v === "custom") {
								setIntervalMode("custom");
							} else {
								setSlideInterval(Number(v));
								setCustomInterval(v);
								setIntervalMode("preset");
							}
						}}
					>
						<SelectTrigger className="h-11 w-24 text-white bg-transparent border-0 shadow-none hover:bg-white/20">
							{!["2", "3", "5", "10", "15"].includes(slideInterval.toString()) &&
							slideInterval !== 0 ? (
								<span>{slideInterval}s</span>
							) : (
								<SelectValue />
							)}
						</SelectTrigger>
						<SelectContent className="bg-gray-800/95 backdrop-blur-md border-gray-600 text-white">
							<SelectItem value="2">2s</SelectItem>
							<SelectItem value="3">3s</SelectItem>
							<SelectItem value="5">5s</SelectItem>
							<SelectItem value="10">10s</SelectItem>
							<SelectItem value="15">15s</SelectItem>
							<SelectItem value="custom">Custom</SelectItem>
						</SelectContent>
					</Select>
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
						className="h-11 w-24 rounded-md border border-0 bg-transparent px-3 py-2 text-white shadow-none hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-blue-400 hide-number-spin"
						placeholder="Custom (s)"
						inputMode="numeric"
						style={{ MozAppearance: "textfield" }}
					/>
				)}

				<Button
					onClick={onTogglePlayback}
					variant="ghost"
					className="h-11 flex-1 text-white hover:bg-white/20 sm:flex-none"
					disabled={playbackDisabled}
				>
					{isPlaying ? (
						<>
							<Pause className="w-4 h-4 mr-2" />
							Pause
						</>
					) : (
						<>
							<Play className="w-4 h-4 mr-2" />
							Play
						</>
					)}
				</Button>
			</div>

			<div className="grid w-full grid-cols-5 gap-1 sm:flex sm:w-auto sm:items-center sm:gap-2">
				<Button
					variant="ghost"
					onClick={onFirst}
					disabled={currentSlide === 0}
					className="size-11 text-white hover:bg-white/20"
					aria-label="First slide"
				>
					<SkipBack className="w-5 h-5" />
				</Button>
				<Button
					variant="ghost"
					onClick={onPrev}
					disabled={currentSlide === 0}
					className="size-11 text-white hover:bg-white/20"
					aria-label="Previous slide"
				>
					<ChevronLeft className="w-5 h-5" />
				</Button>
				<Button
					variant="ghost"
					onClick={onNext}
					disabled={currentSlide === totalSlides - 1}
					className="size-11 text-white hover:bg-white/20"
					aria-label="Next slide"
				>
					<ChevronRight className="w-5 h-5" />
				</Button>
				<Button
					variant="ghost"
					onClick={onLast}
					disabled={currentSlide === totalSlides - 1}
					className="size-11 text-white hover:bg-white/20"
					aria-label="Last slide"
				>
					<SkipForward className="w-5 h-5" />
				</Button>
				<Button
					variant="ghost"
					onClick={onExit}
					className="size-11 px-0 text-xs text-white hover:bg-white/20"
					aria-label="Exit presentation"
				>
					Exit
				</Button>
			</div>
		</div>
	);
};
