import type { ContentSlide, SlideBlock, SlideLayout } from "@/modules/types/presentation";

const isVisualBlock = (block: SlideBlock) =>
    block.type === "image" || block.type === "image-placeholder";

type LayoutGeneratedPlaceholder = Omit<
    Extract<SlideBlock, { type: "image-placeholder" }>,
    "region"
> & {
    region: "right";
    layoutGenerated: true;
};

const isLayoutGeneratedPlaceholder = (block: SlideBlock): block is LayoutGeneratedPlaceholder =>
    block.type === "image-placeholder" &&
    "layoutGenerated" in block &&
    block.layoutGenerated === true;

export function applySlideLayout(slide: ContentSlide, layout: SlideLayout): ContentSlide {
    if (layout === "image-right") {
        const visualBlocks = slide.blocks
            .filter(isVisualBlock)
            .map((block) => ({ ...block, region: "right" as const }));
        const contentBlocks = slide.blocks
            .filter((block) => !isVisualBlock(block))
            .map((block) => ({ ...block, region: "main" as const }));

        if (visualBlocks.length === 0) {
            const placeholder: LayoutGeneratedPlaceholder = {
                type: "image-placeholder",
                region: "right",
                alt: `Supporting visual for ${slide.title}`,
                caption: "Add an image",
                layoutGenerated: true,
            };
            visualBlocks.push(placeholder);
        }

        return { ...slide, layout, blocks: [...contentBlocks, ...visualBlocks] };
    }

    if (layout === "two-column") {
        const hasLeft = slide.blocks.some((block) => block.region === "left");
        const hasRight = slide.blocks.some((block) => block.region === "right");
        const blocks =
            hasLeft && hasRight
                ? slide.blocks
                : slide.blocks.map((block, index) => ({
                      ...block,
                      region: (isVisualBlock(block) || index % 2 === 1 ? "right" : "left") as
                          | "left"
                          | "right",
                  }));
        return { ...slide, layout, blocks };
    }

    return {
        ...slide,
        layout,
        blocks: slide.blocks
            .filter((block) => !isLayoutGeneratedPlaceholder(block))
            .map((block) => ({ ...block, region: "main" })),
    };
}
