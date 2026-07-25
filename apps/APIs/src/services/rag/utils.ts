import {
    isContentSlide,
    isLegacyHtmlSlide,
    isSceneSlide,
    type Slide,
    type SlideBlock,
    type Source,
} from "@slide-sage/types";
import type {
    MemorySourceType,
    SimilarContext,
    StorePresentationSemanticMemoryParams,
} from "./types";

export function buildDeckSummary(params: StorePresentationSemanticMemoryParams): string {
    const slideSummaries = params.slides
        .map((slide, index) => buildSlideSummary(slide, index).summary)
        .join("\n");

    return [
        `Deck title: ${params.title || "Untitled Presentation"}`,
        `User prompt: ${normalizeText(params.prompt)}`,
        `Theme: ${params.theme || "corporate-blue"}`,
        `Tone: ${params.tonality || "professional"}`,
        `Detail level: ${params.detailLevel || "balanced"}`,
        `Slide count: ${params.slides.length}`,
        "Slide summaries:",
        slideSummaries,
    ].join("\n");
}

export function buildSlideSummary(slide: Slide, index: number): { title: string; summary: string } {
    const title = getSlideTitle(slide) || `Slide ${index + 1}`;
    const layout = isContentSlide(slide) ? slide.layout : slide.type;
    const content = isContentSlide(slide)
        ? slide.blocks.map(serializeBlock).filter(Boolean).join(" ")
        : isSceneSlide(slide)
          ? truncateText(JSON.stringify(slide.semantic || slide.root), 700)
          : isLegacyHtmlSlide(slide)
            ? stripHtml(slide.html)
            : truncateText(JSON.stringify(slide.chartConfig), 700);
    const summary = [
        `Slide ${index + 1}`,
        `Title: ${title}`,
        `Type: ${slide.type || "content"}`,
        `Layout: ${layout}`,
        content ? `Content: ${truncateText(content, 1200)}` : "",
    ]
        .filter(Boolean)
        .join("\n");

    return { title, summary };
}

export function buildSourceChunkText(query: string, source: Source): string {
    const lines = [
        `Search query: ${truncateText(query, 500)}`,
        source.title ? `Source title: ${source.title}` : "",
        source.published_date ? `Published: ${source.published_date}` : "",
        source.author ? `Author: ${source.author}` : "",
        source.summary ? `Summary: ${source.summary}` : "",
        source.snippet ? `Snippet: ${source.snippet}` : "",
        source.highlights?.length ? `Highlights: ${source.highlights.join(" ")}` : "",
        `URL: ${source.url}`,
        source.retrieved_at ? `Fetched at: ${source.retrieved_at}` : "",
    ].filter(Boolean);

    return truncateText(lines.join("\n"), 1800);
}

export function serializeSlides(slides: Slide[]): string {
    return slides.map((slide, index) => buildSlideSummary(slide, index).summary).join("\n\n");
}

export function getSlideId(slide: Slide, index: number): string {
    const slideRecord = slide as unknown as Record<string, unknown>;
    return typeof slideRecord["id"] === "string" && slideRecord["id"].trim()
        ? slideRecord["id"].trim()
        : `slide-${index + 1}`;
}

export function contextFromRow(
    sourceType: MemorySourceType,
    sourceId: string,
    context: string,
    similarity: number,
    metadata: unknown
): SimilarContext {
    return {
        sourceType,
        sourceId,
        context,
        similarity: Number(similarity) || 0,
        metadata: asMetadata(metadata),
    };
}

export function asMetadata(metadata: unknown): Record<string, unknown> | undefined {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return undefined;
    }

    return metadata as Record<string, unknown>;
}

export function formatSourceLabel(sourceType: MemorySourceType): string {
    const labels: Record<MemorySourceType, string> = {
        search: "Previous Search",
        iteration: "Previous Iteration",
        presentation: "Presentation Memory",
        slide: "Relevant Slide",
        deck: "Deck Summary",
        source: "Research Source Chunk",
        prompt: "Prompt History",
        template: "Slide Template",
        example: "Similar Example",
        style: "Style Memory",
        feedback: "Feedback Memory",
    };

    return labels[sourceType];
}

export function fallbackPromptIntent(prompt: string): string {
    const normalized = prompt.toLowerCase();
    if (normalized.includes("short") || normalized.includes("concise")) return "make_shorter";
    if (normalized.includes("technical") || normalized.includes("depth")) {
        return "increase_technical_depth";
    }
    if (
        normalized.includes("stat") ||
        normalized.includes("source") ||
        normalized.includes("citation") ||
        normalized.includes("latest")
    ) {
        return "add_grounded_data";
    }
    if (normalized.includes("tone") || normalized.includes("theme")) return "change_tone";
    if (normalized.includes("table") || normalized.includes("comparison")) {
        return "change_layout";
    }
    if (normalized.includes("slide") && normalized.includes("add")) return "insert_slide";
    if (normalized.includes("remove") || normalized.includes("delete")) return "delete_slide";
    return "general_edit";
}

export function normalizeText(text: string): string {
    return String(text ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

export function parseDate(value: string | undefined): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

export function cosineSimilarity(a: number[], b: number[]): number {
    const length = Math.min(a.length, b.length);
    if (length === 0) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < length; i++) {
        const av = a[i] ?? 0;
        const bv = b[i] ?? 0;
        dot += av * bv;
        normA += av * av;
        normB += bv * bv;
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function getSlideTitle(slide: Slide): string {
    if (isContentSlide(slide)) return truncateText(slide.title, 180);
    if (isSceneSlide(slide)) {
        const titleNode = slide.root.children.find(
            (node) => node.type === "text" && (node.role === "title" || node.role === "display")
        );
        return titleNode?.type === "text" ? truncateText(titleNode.text, 180) : "";
    }
    if (!isLegacyHtmlSlide(slide)) return truncateText(slide.chartConfig.title || "", 180);

    const headingMatch = slide.html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i);
    const heading = headingMatch?.[1] ? stripHtml(headingMatch[1]) : "";
    return truncateText(heading.trim(), 180);
}

function serializeBlock(block: SlideBlock): string {
    switch (block.type) {
        case "paragraph":
            return `[${block.region}] ${block.text}`;
        case "bullets":
            return `[${block.region}] ${block.items.join("; ")}`;
        case "table":
            return `[${block.region}] ${[block.headers, ...block.rows]
                .map((row) => row.join(" | "))
                .join("; ")}`;
        case "image":
            return `[${block.region}] Image: ${block.alt} ${block.caption}`;
        case "image-placeholder":
            return `[${block.region}] Image placeholder: ${block.alt} ${block.caption}`;
        case "quote":
            return `[${block.region}] Quote: ${block.text} ${block.attribution}`;
        case "callout":
            return `[${block.region}] ${block.heading}: ${block.text}`;
        case "stats":
            return `[${block.region}] ${block.items
                .map((item) => `${item.value} ${item.label}`)
                .join("; ")}`;
    }
}

function stripHtml(html: string): string {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
}
