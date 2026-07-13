import { Download, LoaderCircle } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PresentationData } from "@/modules/types/presentation";

interface Props {
    presentation: PresentationData;
}

const DownloadPptxButton: React.FC<Props> = ({ presentation }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const download = async () => {
        if (isExporting) return;

        setIsExporting(true);
        setError(null);
        try {
            const { exportEditablePptx } = await import("@/lib/pptx-export");
            await exportEditablePptx(presentation);
        } catch (exportError) {
            console.error("Failed to export editable PowerPoint presentation", exportError);
            setError("PPTX export failed. Please try again.");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="flex flex-col items-start gap-1">
            <Button
                onClick={() => void download()}
                disabled={isExporting || presentation.slides.length === 0}
                variant="outline"
                className="bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20 shadow-none transition-colors duration-200"
            >
                {isExporting ? (
                    <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                    <Download className="w-4 h-4 mr-2" />
                )}
                {isExporting ? "Exporting" : "Export PPTX"}
            </Button>
            {error && (
                <span className="absolute top-full mt-1 text-xs text-red-400 whitespace-nowrap">
                    {error}
                </span>
            )}
        </div>
    );
};

export default DownloadPptxButton;
