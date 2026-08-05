import { toJpeg } from "html-to-image";
import { jsPDF } from "jspdf";

const PDF_WIDTH = 13.333;
const PDF_HEIGHT = 7.5;
const SLIDE_WIDTH = 1280;
const SLIDE_HEIGHT = 720;
const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

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
		const image = await toJpeg(slideElement, {
			cacheBust: true,
			canvasWidth: SLIDE_WIDTH * 2,
			canvasHeight: SLIDE_HEIGHT * 2,
			width: SLIDE_WIDTH,
			height: SLIDE_HEIGHT,
			pixelRatio: 1,
			quality: 0.95,
			imagePlaceholder: TRANSPARENT_PIXEL,
			style: {
				width: `${SLIDE_WIDTH}px`,
				height: `${SLIDE_HEIGHT}px`,
				transform: "none",
				transformOrigin: "top left",
			},
		});

		if (index > 0) {
			pdf.addPage([PDF_WIDTH, PDF_HEIGHT], "landscape");
		}
		pdf.addImage(image, "JPEG", 0, 0, PDF_WIDTH, PDF_HEIGHT, undefined, "FAST");
	}

	pdf.save(safeFileName(title));
};
