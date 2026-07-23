import { ArrowLeft, Presentation, Sparkles } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { SlideLayoutSelector } from "@/components/Viewer/SlideLayoutSelector";
import TemplateSelector from "@/components/Viewer/TemplateSelector";
import type { SlideLayout } from "@/modules/types/presentation";

interface ViewerHeaderControlsProps {
    title?: string;
    canIterate: boolean;
    currentTemplate: string;
    onBack: () => void;
    onTemplateChange: (templateId: string) => void;
    selectedLayout?: SlideLayout;
    onLayoutChange: (layout: SlideLayout) => void;
    layoutDisabled: boolean;
    onIterate: () => void;
    onPresent: () => void;
    presentDisabled?: boolean;
}

export const ViewerHeaderControls: React.FC<ViewerHeaderControlsProps> = ({
    title,
    canIterate,
    currentTemplate,
    onBack,
    onTemplateChange,
    selectedLayout,
    onLayoutChange,
    layoutDisabled,
    onIterate,
    onPresent,
    presentDisabled = false,
}) => {
    return (
        <div
            className="grid flex-shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-4 lg:px-6"
            style={{ minHeight: 48, fontSize: "1rem" }}
        >
            <div className="flex min-w-0 items-center gap-4">
                <Button
                    onClick={onBack}
                    className="bg-transparent hover:bg-white/5 text-white/40 hover:text-white transition-all duration-300 rounded-full p-2 h-10 w-10 border-none shadow-none"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                {title && (
                    <span className="hidden truncate text-lg font-light tracking-wide text-white/60 select-none 2xl:block">
                        {title}
                    </span>
                )}
            </div>

            <div className="flex items-center justify-center gap-2">
                <TemplateSelector
                    selectedTemplate={currentTemplate}
                    onTemplateChange={onTemplateChange}
                />
                <SlideLayoutSelector
                    selectedLayout={selectedLayout}
                    onLayoutChange={onLayoutChange}
                    disabled={layoutDisabled}
                />
                <Button
                    onClick={onIterate}
                    variant="outline"
                    disabled={!canIterate}
                    className="bg-white/5 hover:bg-white/10 backdrop-blur-lg border border-white/5 text-white transition-all duration-300"
                >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Iterate
                </Button>
            </div>

            <div className="flex items-center justify-end gap-2">
                <Button
                    variant="outline"
                    onClick={onPresent}
                    disabled={presentDisabled}
                    className="border-white/5 bg-white/5 text-white hover:bg-white/10"
                >
                    <Presentation className="mr-2 size-4" /> Present
                </Button>
            </div>
        </div>
    );
};
