/**
 * Browser-side half of the thumbnail renderer. Bundled and injected into a
 * headless page by scripts/render-template-thumbnails.ts.
 */
import {
	buildPresentation,
	materializeSlideNodes,
	parseZip,
	renderSlide,
} from "@aiden0z/pptx-renderer";

async function renderCoverSlide(bytes: Uint8Array, width: number) {
	const presentation = buildPresentation(await parseZip(bytes as unknown as ArrayBuffer));
	const slide = presentation.slides?.[0];
	if (!slide) throw new Error("package has no slides");

	materializeSlideNodes(presentation, slide);
	const handle = renderSlide(presentation, slide);
	await handle.ready;

	const scale = width / presentation.width;
	const height = Math.round(presentation.height * scale);

	const stage = document.getElementById("stage");
	if (!stage) throw new Error("stage is missing");
	stage.style.width = `${width}px`;
	stage.style.height = `${height}px`;
	handle.element.style.transformOrigin = "top left";
	handle.element.style.transform = `scale(${scale})`;
	stage.replaceChildren(handle.element);

	// Let webfonts and any late images settle before the screenshot.
	await document.fonts?.ready;
	return { width, height };
}

declare global {
	interface Window {
		renderCoverSlide: typeof renderCoverSlide;
	}
}

window.renderCoverSlide = renderCoverSlide;
