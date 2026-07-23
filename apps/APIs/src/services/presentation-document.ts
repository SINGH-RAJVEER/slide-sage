import {
    PRESENTATION_SCHEMA_VERSION,
    type PresentationDimensions,
    type PresentationJSON,
    type PresentationMutation,
    type PresentationMutationRequest,
    type Slide,
    type SlideBlock,
    THEME_IDS,
    type ThemeId,
} from "@slide-sage/types";
import { processSlide } from "./ai/presentation-content";

const DEFAULT_DIMENSIONS: PresentationDimensions = { width: 1280, height: 720 };
const BLOCK_TYPES = new Set([
    "paragraph",
    "bullets",
    "table",
    "image",
    "image-placeholder",
    "quote",
    "callout",
    "stats",
]);

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function stableId(value: unknown, fallback: string, used: Set<string>): string {
    const candidate = typeof value === "string" ? value.trim().slice(0, 120) : "";
    let id = candidate || fallback;
    let suffix = 2;
    while (used.has(id)) {
        id = `${fallback}-${suffix}`;
        suffix++;
    }
    used.add(id);
    return id;
}

function normalizeDimensions(value: unknown): PresentationDimensions {
    const input = record(value);
    if (!input) return DEFAULT_DIMENSIONS;
    const width = Number(input["width"]);
    const height = Number(input["height"]);
    return {
        width: Number.isFinite(width) ? Math.min(4096, Math.max(320, Math.round(width))) : 1280,
        height: Number.isFinite(height) ? Math.min(4096, Math.max(240, Math.round(height))) : 720,
    };
}

function normalizeBlockIds(slideId: string, blocks: SlideBlock[]): SlideBlock[] {
    const used = new Set<string>();
    return blocks.map((block, index) => ({
        ...block,
        id: stableId(block.id, `${slideId}-block-${index + 1}`, used),
        sourceIds: Array.isArray(block.sourceIds)
            ? block.sourceIds.filter((id): id is string => typeof id === "string").slice(0, 12)
            : [],
    }));
}

function normalizeTransition(value: unknown): Slide["transition"] {
    const input = record(value);
    const type = input?.["type"];
    const validType =
        type === "fade" || type === "slide" || type === "zoom" || type === "morph" ? type : "none";
    const duration = Number(input?.["durationMs"]);
    return {
        type: validType,
        durationMs: Number.isFinite(duration) ? Math.min(10000, Math.max(0, duration)) : 0,
    };
}

function normalizeEffects(value: unknown): NonNullable<Slide["effects"]> {
    if (!Array.isArray(value)) return [];
    return value
        .slice(0, 30)
        .map(record)
        .filter((effect): effect is Record<string, unknown> => effect !== null)
        .filter(
            (effect) =>
                effect["type"] === "fade-in" ||
                effect["type"] === "count-up" ||
                effect["type"] === "ken-burns"
        )
        .map((effect, index) => ({
            id:
                typeof effect["id"] === "string"
                    ? effect["id"].slice(0, 120)
                    : `effect-${index + 1}`,
            type: effect["type"] as "fade-in" | "count-up" | "ken-burns",
            targetBlockId:
                typeof effect["targetBlockId"] === "string"
                    ? effect["targetBlockId"].slice(0, 120)
                    : undefined,
            order:
                typeof effect["order"] === "number"
                    ? Math.min(100, Math.max(0, Math.round(effect["order"])))
                    : undefined,
            durationMs:
                typeof effect["durationMs"] === "number"
                    ? Math.min(10000, Math.max(0, effect["durationMs"]))
                    : undefined,
        }));
}

function normalizeSlide(value: unknown, index: number, used: Set<string>): Slide | null {
    const raw = record(value);
    if (!raw) return null;
    const id = stableId(raw["id"], `slide-${index + 1}`, used);
    if (typeof raw["html"] === "string") {
        return {
            id,
            type: typeof raw["type"] === "string" ? raw["type"] : "legacy",
            html: raw["html"].slice(0, 500000),
            transition: normalizeTransition(raw["transition"]),
            effects: normalizeEffects(raw["effects"]),
        };
    }

    const rawBlocks = Array.isArray(raw["blocks"]) ? raw["blocks"] : [];
    const validRawBlocks = rawBlocks.filter((block) => {
        const value = record(block);
        return value && BLOCK_TYPES.has(String(value["type"]));
    });
    const slide = processSlide({ ...raw, id, blocks: validRawBlocks }, index);
    if (!slide) return null;
    const common = {
        ...slide,
        id,
        transition: normalizeTransition(raw["transition"]),
        effects: normalizeEffects(raw["effects"]),
    };
    if ("blocks" in common) {
        const blocks = common.blocks.map((block, blockIndex) => {
            const rawBlock = record(validRawBlocks[blockIndex]);
            return {
                ...block,
                id: typeof rawBlock?.["id"] === "string" ? rawBlock["id"] : block.id,
                sourceIds: Array.isArray(rawBlock?.["sourceIds"])
                    ? rawBlock["sourceIds"]
                    : block.sourceIds,
            } as SlideBlock;
        });
        return { ...common, blocks: normalizeBlockIds(id, blocks) };
    }
    return common;
}

export function normalizePresentationDocument(value: unknown): PresentationJSON {
    const input = record(value) || {};
    const rawSlides = Array.isArray(input["slides"]) ? input["slides"] : [];
    const used = new Set<string>();
    const slides = rawSlides
        .map((slide, index) => normalizeSlide(slide, index, used))
        .filter((slide): slide is Slide => slide !== null);
    const theme = THEME_IDS.includes(input["theme"] as ThemeId)
        ? (input["theme"] as ThemeId)
        : "corporate-blue";

    return {
        ...input,
        schemaVersion: PRESENTATION_SCHEMA_VERSION,
        title:
            typeof input["title"] === "string" && input["title"].trim()
                ? input["title"].trim().slice(0, 240)
                : "Untitled Presentation",
        theme,
        dimensions: normalizeDimensions(input["dimensions"]),
        slides,
        totalSlides: slides.length,
        sources: Array.isArray(input["sources"]) ? input["sources"] : [],
    } as PresentationJSON;
}

function parseMutation(value: unknown): PresentationMutation {
    const input = record(value);
    if (!input || typeof input["type"] !== "string") {
        throw new Error("Invalid presentation mutation");
    }
    switch (input["type"]) {
        case "update-presentation": {
            const theme = input["theme"];
            if (theme !== undefined && !THEME_IDS.includes(theme as ThemeId)) {
                throw new Error("Invalid presentation theme");
            }
            return {
                type: "update-presentation",
                title:
                    typeof input["title"] === "string"
                        ? input["title"].trim().slice(0, 240)
                        : undefined,
                theme: theme as ThemeId | undefined,
                dimensions:
                    input["dimensions"] === undefined
                        ? undefined
                        : normalizeDimensions(input["dimensions"]),
            };
        }
        case "update-slide": {
            if (typeof input["slideId"] !== "string" || !record(input["slide"])) {
                throw new Error("Invalid slide update");
            }
            return {
                type: "update-slide",
                slideId: input["slideId"],
                slide: input["slide"] as unknown as Slide,
            };
        }
        case "delete-slide":
            if (typeof input["slideId"] !== "string") throw new Error("Invalid slide deletion");
            return { type: "delete-slide", slideId: input["slideId"] };
        case "reorder-slides":
            if (
                !Array.isArray(input["slideIds"]) ||
                !input["slideIds"].every((id) => typeof id === "string")
            ) {
                throw new Error("Invalid slide order");
            }
            return { type: "reorder-slides", slideIds: input["slideIds"] as string[] };
        default:
            throw new Error("Unsupported presentation mutation");
    }
}

export function parsePresentationMutationRequest(value: unknown): PresentationMutationRequest {
    const input = record(value);
    if (!input || !Array.isArray(input["mutations"]) || input["mutations"].length === 0) {
        throw new Error("At least one presentation mutation is required");
    }
    if (input["mutations"].length > 50) {
        throw new Error("A presentation update cannot contain more than 50 mutations");
    }
    return { mutations: input["mutations"].map(parseMutation) };
}

export function applyPresentationMutations(
    current: PresentationJSON,
    mutations: PresentationMutation[]
): PresentationJSON {
    let next = normalizePresentationDocument(current);
    for (const mutation of mutations) {
        if (mutation.type === "update-presentation") {
            next = {
                ...next,
                title: mutation.title || next.title,
                theme: mutation.theme || next.theme,
                dimensions: mutation.dimensions || next.dimensions,
            };
            continue;
        }
        if (mutation.type === "update-slide") {
            const index = next.slides.findIndex((slide) => slide.id === mutation.slideId);
            if (index < 0) throw new Error("Slide not found");
            if (mutation.slide.id !== mutation.slideId)
                throw new Error("Slide IDs cannot be changed");
            const used = new Set(
                next.slides
                    .filter((slide) => slide.id !== mutation.slideId)
                    .map((slide) => slide.id)
            );
            const sanitizedSlide = normalizeSlide(mutation.slide, index, used);
            if (!sanitizedSlide || sanitizedSlide.id !== mutation.slideId) {
                throw new Error("Invalid slide update");
            }
            const slides = [...next.slides];
            slides[index] = sanitizedSlide;
            next = normalizePresentationDocument({ ...next, slides });
            continue;
        }
        if (mutation.type === "delete-slide") {
            if (next.slides.length <= 1)
                throw new Error("A presentation must contain at least one slide");
            if (!next.slides.some((slide) => slide.id === mutation.slideId))
                throw new Error("Slide not found");
            next = normalizePresentationDocument({
                ...next,
                slides: next.slides.filter((slide) => slide.id !== mutation.slideId),
            });
            continue;
        }
        const currentIds = next.slides.map((slide) => slide.id);
        if (
            mutation.slideIds.length !== currentIds.length ||
            new Set(mutation.slideIds).size !== currentIds.length ||
            mutation.slideIds.some((id) => !currentIds.includes(id))
        ) {
            throw new Error("Slide order must contain every slide exactly once");
        }
        const byId = new Map(next.slides.map((slide) => [slide.id, slide]));
        next = normalizePresentationDocument({
            ...next,
            slides: mutation.slideIds.map((id) => byId.get(id)),
        });
    }
    return next;
}
