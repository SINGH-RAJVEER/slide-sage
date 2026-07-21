import type {
    ChartConfig,
    ContentSlide,
    SlideBlock,
    SlideLayout,
    SlideRegion,
    StructuredSlide,
} from "@slide-sage/types";
import { JSONRecoveryError, recoverJson } from "../../utils/json-recovery";

interface RawPresentation extends Record<string, unknown> {
    slides?: unknown;
    title?: unknown;
}

const SLIDE_LAYOUTS = new Set<SlideLayout>([
    "title",
    "content",
    "two-column",
    "quote",
    "image-right",
]);
const CHART_TYPES = new Set<ChartConfig["type"]>([
    "bar",
    "line",
    "pie",
    "doughnut",
    "radar",
    "polarArea",
]);

function text(value: unknown, maximum = 500): string {
    return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function stringArray(value: unknown, maximumItems: number, maximumLength = 300): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .slice(0, maximumItems)
        .map((item) => text(item, maximumLength))
        .filter(Boolean);
}

function normalizeRegion(value: unknown, layout: SlideLayout): SlideRegion {
    const region = value === "left" || value === "right" || value === "main" ? value : "main";
    if (layout === "two-column") return region === "main" ? "left" : region;
    if (layout === "image-right") return region === "left" ? "main" : region;
    return "main";
}

function normalizeImageUrl(value: unknown): string {
    const candidate = text(value, 2048);
    if (!candidate) return "";

    try {
        const url = new URL(candidate);
        return url.protocol === "https:" ? url.toString() : "";
    } catch {
        return "";
    }
}

function normalizeBlock(input: unknown, layout: SlideLayout): SlideBlock | null {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const block = input as Record<string, unknown>;
    const region = normalizeRegion(block["region"], layout);

    switch (block["type"]) {
        case "paragraph": {
            const value = text(block["text"], 1200);
            return value ? { type: "paragraph", region, text: value } : null;
        }
        case "bullets": {
            const items = stringArray(block["items"], 8, 350);
            return items.length > 0
                ? { type: "bullets", region, items, ordered: block["ordered"] === true }
                : null;
        }
        case "table": {
            const headers = stringArray(block["headers"], 6, 120);
            if (headers.length === 0 || !Array.isArray(block["rows"])) return null;
            const rows = block["rows"]
                .slice(0, 8)
                .filter(Array.isArray)
                .map((row) =>
                    row
                        .slice(0, headers.length)
                        .map((cell) => text(cell, 180))
                        .concat(Array(Math.max(0, headers.length - row.length)).fill(""))
                );
            return { type: "table", region, headers, rows };
        }
        case "image": {
            const url = normalizeImageUrl(block["url"]);
            if (!url) return null;
            return {
                type: "image",
                region,
                url,
                alt: text(block["alt"], 240) || "Presentation image",
                caption: text(block["caption"], 300),
            };
        }
        case "image-placeholder":
            return {
                type: "image-placeholder",
                region,
                alt: text(block["alt"], 240) || "Supporting visual",
                caption: text(block["caption"], 300),
            };
        case "quote": {
            const value = text(block["text"], 800);
            return value
                ? {
                      type: "quote",
                      region,
                      text: value,
                      attribution: text(block["attribution"], 200),
                  }
                : null;
        }
        case "callout": {
            const value = text(block["text"], 700);
            return value
                ? {
                      type: "callout",
                      region,
                      heading: text(block["heading"], 180),
                      text: value,
                  }
                : null;
        }
        case "stats": {
            if (!Array.isArray(block["items"])) return null;
            const items = block["items"]
                .slice(0, 6)
                .filter((item) => item && typeof item === "object" && !Array.isArray(item))
                .map((item) => {
                    const record = item as Record<string, unknown>;
                    return {
                        value: text(record["value"], 80),
                        label: text(record["label"], 160),
                    };
                })
                .filter((item) => item.value || item.label);
            return items.length > 0 ? { type: "stats", region, items } : null;
        }
        default:
            return null;
    }
}

function normalizeChartConfig(value: unknown): ChartConfig | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    if (typeof raw["type"] !== "string" || !CHART_TYPES.has(raw["type"] as ChartConfig["type"])) {
        return null;
    }
    if (!raw["data"] || typeof raw["data"] !== "object" || Array.isArray(raw["data"])) {
        return null;
    }

    const rawData = raw["data"] as Record<string, unknown>;
    const labels = stringArray(rawData["labels"], 20, 100);
    if (!Array.isArray(rawData["datasets"])) return null;
    const datasets = rawData["datasets"]
        .slice(0, 6)
        .filter((dataset) => dataset && typeof dataset === "object" && !Array.isArray(dataset))
        .map((dataset) => {
            const record = dataset as Record<string, unknown>;
            const data = Array.isArray(record["data"])
                ? record["data"].slice(0, labels.length || 20).map((item) => Number(item) || 0)
                : [];
            const backgroundColor = Array.isArray(record["backgroundColor"])
                ? stringArray(record["backgroundColor"], 20, 32)
                : text(record["backgroundColor"], 32) || undefined;
            const borderColor = Array.isArray(record["borderColor"])
                ? stringArray(record["borderColor"], 20, 32)
                : text(record["borderColor"], 32) || undefined;
            return {
                label: text(record["label"], 160) || undefined,
                data,
                backgroundColor,
                borderColor,
                borderWidth:
                    typeof record["borderWidth"] === "number"
                        ? Math.max(0, Math.min(record["borderWidth"], 10))
                        : undefined,
            };
        })
        .filter((dataset) => dataset.data.length > 0);

    if (labels.length === 0 || datasets.length === 0) return null;
    return {
        type: raw["type"] as ChartConfig["type"],
        title: text(raw["title"], 200),
        description: text(raw["description"], 500),
        data: { labels, datasets },
        options: {},
    };
}

function chartFallback(id: string): ContentSlide {
    return {
        id,
        type: "content",
        layout: "content",
        title: "Data Visualization",
        subtitle: "",
        blocks: [
            {
                type: "paragraph",
                region: "main",
                text: "Chart data unavailable",
            },
        ],
    };
}

export function processSlide(input: unknown, index: number): StructuredSlide | null {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        console.warn(`Invalid slide ${index}, skipping`);
        return null;
    }

    const slide = input as Record<string, unknown>;
    const id = text(slide["id"], 120) || `slide-${index + 1}`;
    if (slide["type"] === "chart") {
        const chartConfig = normalizeChartConfig(slide["chartConfig"]);
        return chartConfig ? { id, type: "chart", chartConfig } : chartFallback(id);
    }
    if (slide["type"] !== "content") {
        console.warn(`Slide ${index} has an unsupported type, skipping`);
        return null;
    }

    const layout = SLIDE_LAYOUTS.has(slide["layout"] as SlideLayout)
        ? (slide["layout"] as SlideLayout)
        : "content";
    const blocks = Array.isArray(slide["blocks"])
        ? slide["blocks"]
              .slice(0, 12)
              .map((block) => normalizeBlock(block, layout))
              .filter((block): block is SlideBlock => block !== null)
        : [];
    const title = text(slide["title"], 240) || `Slide ${index + 1}`;

    return {
        id,
        type: "content",
        layout,
        title,
        subtitle: text(slide["subtitle"], 400),
        blocks,
    };
}

export function parsePresentationContent(content: string): RawPresentation {
    try {
        return JSON.parse(content) as RawPresentation;
    } catch (jsonError) {
        console.warn("Initial JSON parse failed, attempting recovery...");
        const recoveryResult = recoverJson(content, jsonError as Error);
        if (!recoveryResult.content || typeof recoveryResult.content !== "object") {
            throw new JSONRecoveryError("Recovered response was not a JSON object");
        }
        console.log(`JSON recovery successful using ${recoveryResult.strategy} strategy`);
        return recoveryResult.content as RawPresentation;
    }
}

export function normalizePresentationSlides(
    presentation: RawPresentation,
    expectedSlideCount?: number
): StructuredSlide[] {
    const rawSlides = Array.isArray(presentation.slides) ? presentation.slides : [];
    let slides = rawSlides
        .map((slide, index) => processSlide(slide, index))
        .filter((slide): slide is StructuredSlide => slide !== null);

    if (slides.length === 0) {
        throw new Error("OpenRouter returned no usable slides");
    }
    if (expectedSlideCount !== undefined && slides.length < expectedSlideCount) {
        throw new Error(
            `OpenRouter returned ${slides.length} of ${expectedSlideCount} requested slides`
        );
    }
    if (expectedSlideCount !== undefined && slides.length > expectedSlideCount) {
        console.warn(
            `OpenRouter returned ${slides.length} slides; keeping the requested ${expectedSlideCount}`
        );
        slides = slides.slice(0, expectedSlideCount);
    }

    const usedIds = new Set<string>();
    for (const [index, slide] of slides.entries()) {
        const candidate = String(slide.id || "").trim();
        const fallback = `slide-${index + 1}`;
        let id = candidate && !usedIds.has(candidate) ? candidate : fallback;
        let suffix = 2;
        while (usedIds.has(id)) {
            id = `${fallback}-${suffix}`;
            suffix++;
        }
        slide.id = id;
        usedIds.add(id);
    }

    return slides;
}
