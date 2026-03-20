import { ChevronLeft, ChevronRight, SkipBack, SkipForward, Trash } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";

interface NavigationControlsProps {
    currentSlide: number;
    totalSlides: number;
    onPrevSlide: () => void;
    onNextSlide: () => void;
    onFirstSlide: () => void;
    onLastSlide: () => void;
    onDeleteSlide: () => void;
    canDelete: boolean;
}

export const NavigationControls: React.FC<NavigationControlsProps> = ({
    currentSlide,
    totalSlides,
    onPrevSlide,
    onNextSlide,
    onFirstSlide,
    onLastSlide,
    onDeleteSlide,
    canDelete,
}) => {
    const isFirstSlide = currentSlide === 0;
    const isLastSlide = currentSlide === totalSlides - 1;

    return (
        <div
            className="relative flex items-center mt-3 pt-8 flex-shrink-0"
            style={{ minHeight: 36, fontSize: "0.95rem" }}
        >
            {/* Centered navigation buttons */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-2">
                <Button
                    variant="outline"
                    onClick={onFirstSlide}
                    disabled={isFirstSlide}
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                >
                    <SkipBack className="w-4 h-4" />
                </Button>
                <Button
                    variant="outline"
                    onClick={onPrevSlide}
                    disabled={isFirstSlide}
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Previous
                </Button>
                <Button
                    variant="outline"
                    onClick={onNextSlide}
                    disabled={isLastSlide}
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                >
                    Next
                    <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
                <Button
                    variant="outline"
                    onClick={onLastSlide}
                    disabled={isLastSlide}
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                >
                    <SkipForward className="w-4 h-4" />
                </Button>
            </div>

            {/* Right-aligned delete button, vertically centered */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
                <Button
                    variant="destructive"
                    onClick={onDeleteSlide}
                    disabled={!canDelete}
                    className="bg-red-600/80 border-red-600/40 text-white hover:bg-red-700/90"
                    title="Delete current slide"
                >
                    <Trash className="w-4 h-4 mr-2" />
                    Delete
                </Button>
            </div>
        </div>
    );
};
