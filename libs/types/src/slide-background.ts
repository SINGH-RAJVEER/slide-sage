import type {
	BackgroundFocalPoint,
	BackgroundOverlay,
	ContentSlide,
	ImageBlock,
	ImagePlaceholderBlock,
} from "./index";

export type SlideSupportVisualPlacement = "full";

export interface SlideSupportVisual {
	block: ImageBlock | ImagePlaceholderBlock;
	placement: SlideSupportVisualPlacement;
	overlay: BackgroundOverlay;
	focalPoint: BackgroundFocalPoint;
}

function isSupportVisual(
	block: ContentSlide["blocks"][number],
): block is ImageBlock | ImagePlaceholderBlock {
	return block.type === "image" || block.type === "image-placeholder";
}

export function resolveSlideSupportVisual(slide: ContentSlide): SlideSupportVisual | undefined {
	const visuals = slide.blocks.filter(isSupportVisual);
	if (visuals.length === 0) return undefined;

	if (slide.layout === "cover" || slide.layout === "section") {
		const block = visuals.find((candidate) => candidate.region === "media") || visuals[0];
		if (!block) return undefined;
		return {
			block,
			placement: "full",
			overlay: "strong",
			focalPoint: block.focalPoint || "center",
		};
	}

	if (slide.layout === "media-left" || slide.layout === "media-right") {
		const block = visuals.find((candidate) => candidate.region === "media") || visuals[0];
		if (!block) return undefined;
		return {
			block,
			placement: "full",
			overlay: "subtle",
			focalPoint: block.focalPoint || "center",
		};
	}

	return undefined;
}
