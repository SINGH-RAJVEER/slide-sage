import type { PresentationData } from "@slidesage/types";
import { Button } from "@slidesage/ui/components/button";
import { Check, ChevronLeft, ChevronRight, SkipBack, SkipForward, Trash, X } from "lucide-react";
import type React from "react";
import DownloadMenu, { type PresentationExporter } from "./DownloadMenu";

interface ViewerNavigationControlsProps {
	presentation: PresentationData;
	currentSlide: number;
	totalSlides: number;
	onFirst: () => void;
	onPrev: () => void;
	onNext: () => void;
	onLast: () => void;
	onDelete: () => void;
	deleteDisabled: boolean;
	onCancelGeneration?: () => void;
	cancelDisabled?: boolean;
	onSave?: () => void;
	saveDisabled?: boolean;
	showDownload?: boolean;
	showDelete?: boolean;
	onExport?: PresentationExporter;
}

export const ViewerNavigationControls: React.FC<ViewerNavigationControlsProps> = ({
	presentation,
	currentSlide,
	totalSlides,
	onFirst,
	onPrev,
	onNext,
	onLast,
	onDelete,
	deleteDisabled,
	onCancelGeneration,
	cancelDisabled = false,
	onSave,
	saveDisabled = false,
	showDownload = true,
	showDelete = true,
	onExport,
}) => {
	return (
		<nav
			className="viewer-navigation relative flex items-center mt-3 pt-8 flex-shrink-0"
			aria-label="Slide navigation"
			style={{ minHeight: 36, fontSize: "0.95rem" }}
		>
			{showDownload && (
				<div className="viewer-navigation__download absolute left-0 top-1/2 -translate-y-1/2">
					<DownloadMenu presentation={presentation} onExport={onExport} />
				</div>
			)}

			<div className="viewer-navigation__pager absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-2">
				<Button
					variant="outline"
					onClick={onFirst}
					disabled={totalSlides === 0 || currentSlide === 0}
					aria-label="First slide"
					className="viewer-navigation__edge bg-transparent border-white/5 text-white/60 hover:text-white hover:bg-white/5"
				>
					<SkipBack className="w-4 h-4" />
				</Button>
				<Button
					variant="outline"
					onClick={onPrev}
					disabled={totalSlides === 0 || currentSlide === 0}
					aria-label="Previous slide"
					className="viewer-navigation__previous bg-transparent border-white/5 text-white/60 hover:text-white hover:bg-white/5"
				>
					<ChevronLeft className="w-4 h-4 mr-2" />
					Previous
				</Button>
				<Button
					variant="outline"
					onClick={onNext}
					disabled={totalSlides === 0 || currentSlide === totalSlides - 1}
					aria-label="Next slide"
					className="viewer-navigation__next bg-transparent border-white/5 text-white/60 hover:text-white hover:bg-white/5"
				>
					Next
					<ChevronRight className="w-4 h-4 ml-2" />
				</Button>
				<Button
					variant="outline"
					onClick={onLast}
					disabled={totalSlides === 0 || currentSlide === totalSlides - 1}
					aria-label="Last slide"
					className="viewer-navigation__edge bg-transparent border-white/5 text-white/60 hover:text-white hover:bg-white/5"
				>
					<SkipForward className="w-4 h-4" />
				</Button>
			</div>

			{onCancelGeneration ? (
				<div className="viewer-navigation__delete absolute right-0 top-1/2 flex -translate-y-1/2 gap-2">
					<Button
						variant="destructive"
						onClick={onCancelGeneration}
						disabled={cancelDisabled}
						className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 shadow-none transition-all duration-200"
					>
						<X className="w-4 h-4 mr-2" />
						Cancel generation
					</Button>
				</div>
			) : (
				showDelete && (
					<div className="viewer-navigation__delete absolute right-0 top-1/2 flex -translate-y-1/2 gap-2">
						{onSave && (
							<Button variant="outline" onClick={onSave} disabled={saveDisabled}>
								<Check className="mr-2 size-4" /> Save
							</Button>
						)}
						<Button
							variant="destructive"
							onClick={onDelete}
							disabled={deleteDisabled}
							className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 shadow-none transition-all duration-200"
							title="Delete current slide"
						>
							<Trash className="w-4 h-4 mr-2" />
							Delete
						</Button>
					</div>
				)
			)}
		</nav>
	);
};
