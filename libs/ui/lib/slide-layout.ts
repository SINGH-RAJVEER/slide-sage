import type { ContentSlide, SlideBlock, SlideLayout, SlideRegion } from "@slidesage/types";

const isVisualBlock = (block: SlideBlock) =>
	block.type === "image" || block.type === "image-placeholder";

type LayoutGeneratedPlaceholder = Extract<SlideBlock, { type: "image-placeholder" }> & {
	layoutGenerated: true;
};

const isLayoutGeneratedPlaceholder = (block: SlideBlock): block is LayoutGeneratedPlaceholder =>
	block.type === "image-placeholder" &&
	"layoutGenerated" in block &&
	block.layoutGenerated === true;

function withRegion(block: SlideBlock, region: SlideRegion): SlideBlock {
	return { ...block, region };
}

function distributePaired(blocks: SlideBlock[]): SlideBlock[] {
	const hasPrimary = blocks.some((block) => block.region === "primary");
	const hasSecondary = blocks.some((block) => block.region === "secondary");
	if (hasPrimary && hasSecondary) return blocks;
	return blocks.map((block, index) => withRegion(block, index % 2 === 0 ? "primary" : "secondary"));
}

export function applySlideLayout(slide: ContentSlide, layout: SlideLayout): ContentSlide {
	const authoredBlocks = slide.blocks.filter((block) => !isLayoutGeneratedPlaceholder(block));

	if (layout === "media-left" || layout === "media-right") {
		const media = authoredBlocks.filter(isVisualBlock).map((block) => withRegion(block, "media"));
		const content = authoredBlocks
			.filter((block) => !isVisualBlock(block))
			.map((block, index) => withRegion(block, index < 2 ? "primary" : "secondary"));

		if (media.length === 0) {
			const placeholder: LayoutGeneratedPlaceholder = {
				type: "image-placeholder",
				region: "media",
				alt: `Supporting visual for ${slide.title}`,
				caption: "Add an image",
				layoutGenerated: true,
			};
			media.push(placeholder);
		}
		return { ...slide, layout, blocks: [...content, ...media] };
	}

	if (layout === "split" || layout === "comparison") {
		return { ...slide, layout, blocks: distributePaired(authoredBlocks) };
	}

	if (layout === "sidebar") {
		const hasRail = authoredBlocks.some((block) => block.region === "secondary");
		const blocks = hasRail
			? authoredBlocks.map((block) =>
					withRegion(block, block.region === "secondary" ? "secondary" : "primary"),
				)
			: authoredBlocks.map((block, index) =>
					withRegion(block, index > 0 && index % 3 === 0 ? "secondary" : "primary"),
				);
		return { ...slide, layout, blocks };
	}

	if (layout === "spotlight") {
		const heroIndex = Math.max(
			0,
			authoredBlocks.findIndex((block) => block.emphasis === "hero"),
		);
		return {
			...slide,
			layout,
			blocks: authoredBlocks.map((block, index) =>
				withRegion(block, index === heroIndex ? "primary" : "secondary"),
			),
		};
	}

	return {
		...slide,
		layout,
		blocks: authoredBlocks.map((block) => withRegion(block, "main")),
	};
}
