import { Button } from "@slidesage/ui/components/button";
import { Plus } from "lucide-react";
import type React from "react";

interface CreatePresentationButtonProps {
    onCreateClick: () => void;
}

export const CreatePresentationButton: React.FC<CreatePresentationButtonProps> = ({
    onCreateClick,
}) => {
    return (
        <div className="group fixed bottom-8 right-8 z-50">
            <Button
                onClick={onCreateClick}
                className="h-16 w-16 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-lg border border-white/30 text-white shadow-[0_8px_32px_0_rgba(255,255,255,0.1)] hover:shadow-[0_8px_32px_0_rgba(255,255,255,0.2)] transition-all duration-300 p-0"
            >
                <Plus className="h-8 w-8" />
            </Button>
            <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                <div className="bg-white/10 backdrop-blur-lg border border-white/30 text-white px-4 py-2 rounded-lg shadow-lg whitespace-nowrap">
                    Create New Presentation
                </div>
            </div>
        </div>
    );
};
