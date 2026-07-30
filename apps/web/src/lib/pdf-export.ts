import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const PDF_WIDTH = 13.333;
const PDF_HEIGHT = 7.5;

const safeFileName = (title: string) => {
    const normalized = (title || "Untitled Presentation")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/[. ]+$/g, "")
        .slice(0, 120);

    return `${normalized || "Untitled Presentation"}.pdf`;
};

export const exportPresentationPdf = async (title: string) => {
    const slideElements = Array.from(
        document.querySelectorAll<HTMLElement>(".slide-carousel [data-pdf-slide]"),
    );
    if (slideElements.length === 0) {
        throw new Error("No rendered slides are available to export.");
    }

    await document.fonts?.ready;

    const pdf = new jsPDF({
        orientation: "landscape",
        unit: "in",
        format: [PDF_WIDTH, PDF_HEIGHT],
        compress: true,
    });

    for (const [index, slideElement] of slideElements.entries()) {
        const canvas = await html2canvas(slideElement, {
            backgroundColor: null,
            logging: false,
            scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
            useCORS: true,
        });

        if (index > 0) {
            pdf.addPage([PDF_WIDTH, PDF_HEIGHT], "landscape");
        }
        pdf.addImage(
            canvas.toDataURL("image/jpeg", 0.94),
            "JPEG",
            0,
            0,
            PDF_WIDTH,
            PDF_HEIGHT,
            undefined,
            "FAST",
        );
    }

    pdf.save(safeFileName(title));
};
