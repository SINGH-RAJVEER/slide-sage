import { Button } from "@slidesage/ui/components/button";
import { ArrowLeft, Palette, Presentation, Sparkles } from "lucide-react";
import type React from "react";

interface ViewerHeaderControlsProps {
	title?: string;
	canIterate: boolean;
	onBack: () => void;
	onIterate: () => void;
	onPresent: () => void;
	presentDisabled?: boolean;
	/** Name of the PowerPoint template the deck was generated from. */
	templateLabel?: string;
	showIterate?: boolean;
}

export const ViewerHeaderControls: React.FC<ViewerHeaderControlsProps> = ({
	title,
	canIterate,
	onBack,
	onIterate,
	onPresent,
	presentDisabled = false,
	templateLabel,
	showIterate = true,
}) => {
	return (
		<header
			className="viewer-header grid flex-shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-4 lg:px-6"
			style={{ minHeight: 48, fontSize: "1rem" }}
		>
			<div className="viewer-header__identity flex min-w-0 items-center gap-4">
				<Button
					onClick={onBack}
					aria-label="Back to presentations"
					className="viewer-header__back bg-transparent hover:bg-white/5 text-white/40 hover:text-white transition-all duration-300 rounded-full p-2 h-10 w-10 border-none shadow-none"
				>
					<ArrowLeft className="w-5 h-5" />
				</Button>
				{title && (
					<span className="viewer-header__title hidden truncate text-lg font-light tracking-wide text-white/60 select-none 2xl:block">
						{title}
					</span>
				)}
			</div>

			<div className="viewer-header__tools flex items-center justify-center gap-2">
				{templateLabel && (
					<div className="flex h-10 items-center gap-2 rounded-md border border-white/5 bg-white/5 px-3 text-sm text-white/75">
						<Palette className="size-4 text-blue-400" />
						{templateLabel}
					</div>
				)}
				{showIterate && (
					<Button
						onClick={onIterate}
						variant="outline"
						disabled={!canIterate}
						aria-label="Iterate presentation"
						className="viewer-header__iterate bg-white/5 hover:bg-white/10 backdrop-blur-lg border border-white/5 text-white transition-all duration-300"
					>
						<Sparkles className="w-4 h-4 mr-2" />
						Iterate
					</Button>
				)}
			</div>

			<div className="viewer-header__present flex items-center justify-end gap-2">
				<Button
					variant="outline"
					onClick={onPresent}
					disabled={presentDisabled}
					aria-label="Present slideshow"
					className="viewer-header__present-button border-white/5 bg-white/5 text-white hover:bg-white/10"
				>
					<Presentation className="mr-2 size-4" /> Present
				</Button>
			</div>
		</header>
	);
};
