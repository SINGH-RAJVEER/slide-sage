import { ChevronLeft, ChevronRight, SkipBack, SkipForward, Trash } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import DownloadPptxButton from "@/components/Viewer/DownloadPptxButton";
import type { PresentationData } from "@/modules/types/presentation";

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
}) => {
    return (
        <div
            className="relative flex items-center mt-3 pt-8 flex-shrink-0"
            style={{ minHeight: 36, fontSize: "0.95rem" }}
        >
            <div className="absolute left-0 top-1/2 -translate-y-1/2">
                <DownloadPptxButton presentation={presentation} />
            </div>

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-2">
                <Button
                    variant="outline"
                    onClick={onFirst}
                    disabled={currentSlide === 0}
                    className="bg-transparent border-white/5 text-white/60 hover:text-white hover:bg-white/5"
                >
                    <SkipBack className="w-4 h-4" />
                </Button>
                <Button
                    variant="outline"
                    onClick={onPrev}
                    disabled={currentSlide === 0}
                    className="bg-transparent border-white/5 text-white/60 hover:text-white hover:bg-white/5"
                >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Previous
                </Button>
                <Button
                    variant="outline"
                    onClick={onNext}
                    disabled={currentSlide === totalSlides - 1}
                    className="bg-transparent border-white/5 text-white/60 hover:text-white hover:bg-white/5"
                >
                    Next
                    <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
                <Button
                    variant="outline"
                    onClick={onLast}
                    disabled={currentSlide === totalSlides - 1}
                    className="bg-transparent border-white/5 text-white/60 hover:text-white hover:bg-white/5"
                >
                    <SkipForward className="w-4 h-4" />
                </Button>
            </div>

            <div className="absolute right-0 top-1/2 -translate-y-1/2">
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
        </div>
    );
};
