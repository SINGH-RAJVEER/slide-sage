import type { SlideBlock, SlideLayout, SlideRegion } from "@/modules/types/presentation";

export type SlideBlockKind = SlideBlock["type"];
export type EditableSlideBlock = SlideBlock & { id: string };

export const BLOCK_LABELS: Record<SlideBlockKind, string> = {
    paragraph: "Paragraph",
    bullets: "Bullets",
    table: "Table",
    image: "Image",
    "image-placeholder": "Image placeholder",
    quote: "Quote",
    callout: "Callout",
    stats: "Statistics",
};

function createBlockId(slideId: string): string {
    const suffix = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    return `${slideId}-block-${suffix}`.slice(0, 120);
}

export function normalizeBlockRegion(
    region: SlideRegion,
    layout: SlideLayout,
    type: SlideBlockKind,
): SlideRegion {
    if (layout === "two-column") return region === "right" ? "right" : "left";
    if (layout === "image-right" && (type === "image" || type === "image-placeholder")) {
        return "right";
    }
    return "main";
}

export function prepareEditableBlocks(
    slideId: string,
    blocks: SlideBlock[],
    layout: SlideLayout,
): EditableSlideBlock[] {
    const used = new Set<string>();
    return blocks.map((block) => {
        let id = block.id?.trim() || createBlockId(slideId);
        while (used.has(id)) id = createBlockId(slideId);
        used.add(id);
        return {
            ...block,
            id,
            region: normalizeBlockRegion(block.region, layout, block.type),
        } as EditableSlideBlock;
    });
}

export function createDefaultBlock(
    slideId: string,
    kind: SlideBlockKind,
    layout: SlideLayout,
): EditableSlideBlock {
    const base = {
        id: createBlockId(slideId),
        region: normalizeBlockRegion("main", layout, kind),
        sourceIds: [],
    };
    switch (kind) {
        case "paragraph":
            return { ...base, type: kind, text: "New paragraph" };
        case "bullets":
            return { ...base, type: kind, items: ["New point"], ordered: false };
        case "table":
            return { ...base, type: kind, headers: ["Column"], rows: [["Value"]] };
        case "image":
            return { ...base, type: kind, url: "https://", alt: "Supporting visual", caption: "" };
        case "image-placeholder":
            return { ...base, type: kind, alt: "Supporting visual", caption: "Add an image" };
        case "quote":
            return { ...base, type: kind, text: "New quote", attribution: "" };
        case "callout":
            return { ...base, type: kind, heading: "Key point", text: "Add supporting detail" };
        case "stats":
            return { ...base, type: kind, items: [{ value: "0", label: "Metric" }] };
    }
}

export function duplicateBlock(slideId: string, block: EditableSlideBlock): EditableSlideBlock {
    return { ...structuredClone(block), id: createBlockId(slideId) };
}

export function moveBlock(
    blocks: EditableSlideBlock[],
    index: number,
    offset: -1 | 1,
): EditableSlideBlock[] {
    const destination = index + offset;
    if (destination < 0 || destination >= blocks.length) return blocks;
    const current = blocks[index];
    const target = blocks[destination];
    if (!current || !target) return blocks;
    const next = [...blocks];
    next[index] = target;
    next[destination] = current;
    return next;
}

export function blockPreview(block: SlideBlock): string {
    switch (block.type) {
        case "paragraph":
        case "quote":
            return block.text;
        case "bullets":
            return block.items.join(" · ");
        case "table":
            return block.headers.join(" · ");
        case "image":
        case "image-placeholder":
            return block.caption || block.alt;
        case "callout":
            return `${block.heading}: ${block.text}`;
        case "stats":
            return block.items.map((item) => `${item.value} ${item.label}`).join(" · ");
    }
}

export function validateBlocks(blocks: EditableSlideBlock[]): string | null {
    for (const block of blocks) {
        if (block.type === "paragraph" && !block.text.trim()) return "Paragraphs cannot be empty.";
        if (block.type === "bullets" && block.items.every((item) => !item.trim())) {
            return "Bullet lists need at least one point.";
        }
        if (block.type === "table" && block.headers.every((header) => !header.trim())) {
            return "Tables need at least one header.";
        }
        if (block.type === "image") {
            try {
                if (new URL(block.url).protocol !== "https:") throw new Error();
            } catch {
                return "Image URLs must be valid HTTPS links.";
            }
        }
        if (block.type === "quote" && !block.text.trim()) return "Quotes cannot be empty.";
        if (block.type === "callout" && (!block.heading.trim() || !block.text.trim())) {
            return "Callouts need a heading and supporting text.";
        }
        if (block.type === "stats" && block.items.length === 0) {
            return "Statistics need at least one value.";
        }
    }
    return null;
}
