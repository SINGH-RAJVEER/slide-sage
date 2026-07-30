import {
    PRESENTATION_SCHEMA_VERSION,
    type PresentationDimensions,
    type PresentationJSON,
    type PresentationMutation,
    type PresentationMutationRequest,
    SCENE_ENGINE_VERSION,
    SCENE_PRESENTATION_SCHEMA_VERSION,
    type SceneGroupNode,
    type SceneNode,
    type SceneResponsiveProfile,
    type SceneSlide,
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
    "widget",
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
    if (raw["type"] === "scene") {
        const root = normalizeSceneNode(raw["root"], `${id}-root`, 0);
        if (!root || root.type !== "group") return null;
        const variants = Array.isArray(raw["variants"])
            ? raw["variants"]
                  .slice(0, 4)
                  .map(record)
                  .filter((variant): variant is Record<string, unknown> => variant !== null)
                  .map((variant) => {
                      const profile = variant["profile"];
                      if (
                          profile !== "wide" &&
                          profile !== "standard" &&
                          profile !== "portrait" &&
                          profile !== "compact"
                      ) {
                          return null;
                      }
                      const variantRoot = normalizeSceneNode(
                          variant["root"],
                          `${id}-${profile}-root`,
                          0
                      );
                      const patches = Array.isArray(variant["patches"])
                          ? variant["patches"]
                                .slice(0, 120)
                                .map(record)
                                .filter((patch): patch is Record<string, unknown> => patch !== null)
                                .filter((patch) => typeof patch["nodeId"] === "string")
                                .map((patch) => ({
                                    nodeId: String(patch["nodeId"]).slice(0, 120),
                                    bounds: normalizeSceneRect(patch["bounds"]),
                                    hidden:
                                        typeof patch["hidden"] === "boolean"
                                            ? patch["hidden"]
                                            : undefined,
                                    order: Number.isFinite(Number(patch["order"]))
                                        ? Math.round(Number(patch["order"]))
                                        : undefined,
                                    style: record(patch["style"]) as SceneNode["style"],
                                    size: record(patch["size"]) as SceneNode["size"],
                                    grid: record(patch["grid"]) as SceneNode["grid"],
                                }))
                          : [];
                      return {
                          profile: profile as SceneResponsiveProfile,
                          patches,
                          ...(variantRoot?.type === "group" ? { root: variantRoot } : {}),
                      };
                  })
                  .filter((variant): variant is NonNullable<typeof variant> => variant !== null)
            : undefined;
        return {
            id,
            type: "scene",
            root,
            variants,
            strategy:
                typeof raw["strategy"] === "string" ? raw["strategy"].slice(0, 100) : undefined,
            semantic: record(raw["semantic"]) || undefined,
            artDirection: record(raw["artDirection"]) as SceneSlide["artDirection"],
            transition: normalizeTransition(raw["transition"]),
            effects: normalizeEffects(raw["effects"]),
        };
    }
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

function normalizeSceneNode(value: unknown, fallbackId: string, depth: number): SceneNode | null {
    if (depth > 12) return null;
    const raw = record(value);
    if (!raw) return null;
    const type = raw["type"];
    if (
        type !== "group" &&
        type !== "text" &&
        type !== "image" &&
        type !== "shape" &&
        type !== "widget"
    ) {
        return null;
    }
    const base = {
        id:
            typeof raw["id"] === "string"
                ? raw["id"].trim().slice(0, 120) || fallbackId
                : fallbackId,
        order: Number.isFinite(Number(raw["order"])) ? Math.round(Number(raw["order"])) : 0,
        bounds: normalizeSceneRect(raw["bounds"]),
        size: record(raw["size"]) as SceneNode["size"],
        grid: record(raw["grid"]) as SceneNode["grid"],
        zIndex: Number.isFinite(Number(raw["zIndex"]))
            ? Math.round(Number(raw["zIndex"]))
            : undefined,
        rotation: Number.isFinite(Number(raw["rotation"])) ? Number(raw["rotation"]) : undefined,
        hidden: raw["hidden"] === true,
        optional: raw["optional"] === true,
        sourceIds: Array.isArray(raw["sourceIds"])
            ? raw["sourceIds"]
                  .filter((item): item is string => typeof item === "string")
                  .slice(0, 12)
            : [],
        ariaLabel:
            typeof raw["ariaLabel"] === "string" ? raw["ariaLabel"].slice(0, 500) : undefined,
        style: record(raw["style"]) as SceneNode["style"],
    };
    if (type === "group") {
        const layout = raw["layout"];
        const children = Array.isArray(raw["children"])
            ? raw["children"]
                  .slice(0, 120)
                  .map((child, index) =>
                      normalizeSceneNode(child, `${base.id}-${index + 1}`, depth + 1)
                  )
                  .filter((child): child is SceneNode => child !== null)
            : [];
        return {
            ...base,
            type,
            layout:
                layout === "absolute" || layout === "grid" || layout === "overlay"
                    ? layout
                    : "stack",
            direction: raw["direction"] === "horizontal" ? "horizontal" : "vertical",
            align:
                raw["align"] === "center" || raw["align"] === "end" || raw["align"] === "stretch"
                    ? raw["align"]
                    : "start",
            distribute:
                raw["distribute"] === "center" ||
                raw["distribute"] === "end" ||
                raw["distribute"] === "space-between"
                    ? raw["distribute"]
                    : "start",
            gap: Number.isFinite(Number(raw["gap"])) ? Math.max(0, Number(raw["gap"])) : 0,
            padding: record(raw["padding"]) as SceneGroupNode["padding"],
            columns: Array.isArray(raw["columns"])
                ? raw["columns"]
                      .filter((item): item is number => typeof item === "number")
                      .slice(0, 12)
                : undefined,
            rows: Array.isArray(raw["rows"])
                ? raw["rows"]
                      .filter((item): item is number => typeof item === "number")
                      .slice(0, 12)
                : undefined,
            clip: raw["clip"] === true,
            children,
        };
    }
    if (type === "text") {
        const role = raw["role"];
        return {
            ...base,
            type,
            role:
                role === "display" ||
                role === "title" ||
                role === "subtitle" ||
                role === "caption" ||
                role === "label"
                    ? role
                    : "body",
            text: typeof raw["text"] === "string" ? raw["text"].slice(0, 20000) : "",
            maxLines: Number.isFinite(Number(raw["maxLines"]))
                ? Number(raw["maxLines"])
                : undefined,
            minFontSize: Number.isFinite(Number(raw["minFontSize"]))
                ? Number(raw["minFontSize"])
                : undefined,
        };
    }
    if (type === "image") {
        const url =
            typeof raw["url"] === "string" && raw["url"].startsWith("https://")
                ? raw["url"]
                : undefined;
        return {
            ...base,
            type,
            url,
            alt: typeof raw["alt"] === "string" ? raw["alt"].slice(0, 1000) : "Image",
            caption: typeof raw["caption"] === "string" ? raw["caption"].slice(0, 1000) : "",
            fit: raw["fit"] === "contain" ? "contain" : "cover",
            focalPoint: record(raw["focalPoint"]) as { x: number; y: number } | undefined,
        };
    }
    if (type === "shape") {
        return {
            ...base,
            type,
            shape:
                raw["shape"] === "ellipse" || raw["shape"] === "line" ? raw["shape"] : "rectangle",
        };
    }
    const kind = raw["kind"];
    const validKinds = new Set([
        "chart",
        "table",
        "stats",
        "quote",
        "callout",
        "timeline",
        "process",
        "comparison",
        "architecture",
    ]);
    if (typeof kind !== "string" || !validKinds.has(kind)) return null;
    return {
        ...base,
        type,
        kind: kind as Extract<SceneNode, { type: "widget" }>["kind"],
        version: 1,
        props: record(raw["props"]) || {},
    };
}

function normalizeSceneRect(value: unknown) {
    const raw = record(value);
    if (!raw) return undefined;
    return {
        x: Number(raw["x"]) || 0,
        y: Number(raw["y"]) || 0,
        width: Math.max(0, Number(raw["width"]) || 0),
        height: Math.max(0, Number(raw["height"]) || 0),
    };
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
        schemaVersion:
            slides.length > 0 && slides.every((slide) => slide.type === "scene")
                ? SCENE_PRESENTATION_SCHEMA_VERSION
                : PRESENTATION_SCHEMA_VERSION,
        engineVersion:
            slides.length > 0 && slides.every((slide) => slide.type === "scene")
                ? typeof input["engineVersion"] === "string"
                    ? input["engineVersion"]
                    : SCENE_ENGINE_VERSION
                : undefined,
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
