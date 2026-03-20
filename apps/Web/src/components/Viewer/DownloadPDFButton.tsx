import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { Download } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";

interface Props {
    title: string;
}

const DownloadPPTXButton: React.FC<Props> = ({ title }) => {
    const download = async () => {
        const safeTitle = title || "Untitled Presentation";
        const safeFileTitle = safeTitle.replace(/[\\/:*?"<>|]/g, "_");

        const slideNodes = Array.from(
            document.querySelectorAll(".slide-carousel__item"),
        ) as HTMLElement[];

        const images: string[] = [];
        for (const node of slideNodes) {
            try {
                const contentNode = (node.querySelector('[id="slide-content"]') ||
                    node.querySelector(".template-applier") ||
                    node) as HTMLElement;

                const dataUrl = await toPng(contentNode, {
                    backgroundColor: "#1f2937",
                    cacheBust: true,
                    pixelRatio: 2,
                    skipFonts: true,
                    skipAutoScale: false,
                    preferredFontFormat: "woff",
                    filter: (node) => {
                        // Skip images that might have CORS issues
                        if (node instanceof HTMLImageElement) {
                            return node.complete && node.naturalHeight !== 0;
                        }
                        return true;
                    },
                });
                images.push(dataUrl);
            } catch (error) {
                console.error("Error capturing slide:", error);
                // Continue with other slides even if one fails
            }
        }

        if (images.length === 0) {
            alert("Failed to capture slides. Please try again.");
            return;
        }

        const pdf = new jsPDF({
            orientation: "landscape",
            unit: "pt",
            format: "a4",
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        images.forEach((img, index) => {
            if (index > 0) {
                pdf.addPage("a4", "landscape");
            }

            const imageProps = pdf.getImageProperties(img);
            const imageWidth = imageProps.width;
            const imageHeight = imageProps.height;
            const scale = Math.min(pageWidth / imageWidth, pageHeight / imageHeight);
            const renderWidth = imageWidth * scale;
            const renderHeight = imageHeight * scale;
            const x = (pageWidth - renderWidth) / 2;
            const y = (pageHeight - renderHeight) / 2;

            pdf.addImage(img, "PNG", x, y, renderWidth, renderHeight);
        });

        pdf.save(`${safeFileTitle}.pdf`);
    };

    return (
        <Button
            onClick={download}
            variant="outline"
            className="bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20 shadow-none transition-all duration-200"
        >
            <Download className="w-4 h-4 mr-2" />
            Download
        </Button>
    );
};

export default DownloadPPTXButton;
