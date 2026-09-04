import {
	buildPresentation,
	materializeSlideNodes,
	parseZip,
	type PresentationData as PptxPresentation,
	renderSlide,
	type SlideData,
	type SlideHandle,
} from "@aiden0z/pptx-renderer";

/**
 * A parsed PPTX revision. One instance is shared by the carousel, the
 * thumbnails, and fullscreen playback so a deck is parsed once per revision.
 */
export interface PptxDocument {
	presentation: PptxPresentation;
	slides: SlideData[];
	/** Slide width in points, as declared by the package. */
	width: number;
	height: number;
}

export async function loadPptxDocument(source: ArrayBuffer | Uint8Array): Promise<PptxDocument> {
	const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
	const presentation = buildPresentation(await parseZip(bytes as unknown as ArrayBuffer));
	return {
		presentation,
		slides: presentation.slides ?? [],
		width: presentation.width,
		height: presentation.height,
	};
}

/**
 * Renders one slide into `container`, replacing whatever it held, and scales the
 * result to fill the container's width. Returns a disposer that releases the
 * slide's chart instances and blob URLs.
 */
export function mountPptxSlide(
	container: HTMLElement,
	document: PptxDocument,
	index: number,
): () => void {
	const slide = document.slides[index];
	if (!slide) return () => {};

	materializeSlideNodes(document.presentation, slide);
	let handle: SlideHandle;
	try {
		handle = renderSlide(document.presentation, slide);
	} catch {
		return () => {};
	}

	const element = handle.element;
	element.style.transformOrigin = "top left";
	container.replaceChildren(element);

	const applyScale = () => {
		const available = container.clientWidth;
		if (!available || !document.width) return;
		element.style.transform = `scale(${available / document.width})`;
	};
	applyScale();

	const observer = new ResizeObserver(applyScale);
	observer.observe(container);

	return () => {
		observer.disconnect();
		handle.dispose();
		if (element.parentNode === container) container.removeChild(element);
	};
}
