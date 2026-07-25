import type {
    ContentSlide,
    PresentationDimensions,
    ResolvedScene,
    ResolvedSceneNode,
    SceneDiagnostic,
    SceneGroupNode,
    SceneNode,
    SceneNodePatch,
    SceneRect,
    SceneResponsiveProfile,
    SceneSlide,
    Slide,
    SlideBlock,
} from "./index";
import { isSceneSlide } from "./index";

const MAX_SCENE_DEPTH = 12;
const MAX_SCENE_NODES = 240;

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeRect(value: SceneRect | undefined, fallback: SceneRect): SceneRect {
    return {
        x: finite(value?.x, fallback.x),
        y: finite(value?.y, fallback.y),
        width: Math.max(0, finite(value?.width, fallback.width)),
        height: Math.max(0, finite(value?.height, fallback.height)),
    };
}

function applyPatch(node: SceneNode, patches: Map<string, SceneNodePatch>): SceneNode {
    const patch = patches.get(node.id);
    const next = patch
        ? {
              ...node,
              ...(patch.bounds ? { bounds: { ...node.bounds, ...patch.bounds } as SceneRect } : {}),
              ...(patch.hidden === undefined ? {} : { hidden: patch.hidden }),
              ...(patch.order === undefined ? {} : { order: patch.order }),
              ...(patch.style ? { style: { ...node.style, ...patch.style } } : {}),
              ...(patch.size ? { size: { ...node.size, ...patch.size } } : {}),
              ...(patch.grid ? { grid: { ...node.grid, ...patch.grid } } : {}),
          }
        : node;
    if (next.type !== "group") return next;
    return { ...next, children: next.children.map((child) => applyPatch(child, patches)) };
}

export function sceneForProfile(
    slide: SceneSlide,
    profile: SceneResponsiveProfile,
): SceneGroupNode {
    const variant = slide.variants?.find((candidate) => candidate.profile === profile);
    if (!variant) return slide.root;
    if (variant.root) return variant.root;
    const patches = new Map(variant.patches.map((patch) => [patch.nodeId, patch]));
    return applyPatch(slide.root, patches) as SceneGroupNode;
}

export function validateSceneSlide(slide: SceneSlide): SceneDiagnostic[] {
    const diagnostics: SceneDiagnostic[] = [];
    const ids = new Set<string>();
    let nodes = 0;

    function visit(node: SceneNode, depth: number): void {
        nodes++;
        if (!node.id.trim() || ids.has(node.id)) {
            diagnostics.push({
                code: "invalid-node",
                nodeId: node.id || "unknown",
                message: node.id ? "Scene node IDs must be unique" : "Scene nodes require an ID",
            });
        }
        ids.add(node.id);
        if (depth > MAX_SCENE_DEPTH) {
            diagnostics.push({
                code: "invalid-node",
                nodeId: node.id,
                message: `Scene depth exceeds ${MAX_SCENE_DEPTH}`,
            });
        }
        if (node.type === "widget" && node.version !== 1) {
            diagnostics.push({
                code: "unsupported-widget",
                nodeId: node.id,
                message: `Unsupported ${node.kind} widget version ${node.version}`,
            });
        }
        if (node.type === "image" && !node.url) {
            diagnostics.push({
                code: "missing-asset",
                nodeId: node.id,
                message: "Image node has no resolved asset",
            });
        }
        if (node.type === "group") {
            for (const child of node.children) visit(child, depth + 1);
        }
    }

    visit(slide.root, 0);
    if (nodes > MAX_SCENE_NODES) {
        diagnostics.push({
            code: "invalid-node",
            nodeId: slide.root.id,
            message: `Scene contains ${nodes} nodes; maximum is ${MAX_SCENE_NODES}`,
        });
    }
    return diagnostics;
}

function insets(group: SceneGroupNode) {
    return {
        top: finite(group.padding?.top, 0),
        right: finite(group.padding?.right, 0),
        bottom: finite(group.padding?.bottom, 0),
        left: finite(group.padding?.left, 0),
    };
}

function constrainedRect(node: SceneNode, rect: SceneRect): SceneRect {
    const size = node.size;
    const width = clamp(
        finite(size?.width, rect.width),
        finite(size?.minWidth, 0),
        finite(size?.maxWidth, Number.MAX_SAFE_INTEGER),
    );
    const height = clamp(
        finite(size?.height, rect.height),
        finite(size?.minHeight, 0),
        finite(size?.maxHeight, Number.MAX_SAFE_INTEGER),
    );
    return { ...rect, width, height };
}

function resolveNode(
    node: SceneNode,
    allocated: SceneRect,
    diagnostics: SceneDiagnostic[],
): ResolvedSceneNode {
    const bounds = constrainedRect(node, allocated);
    if (node.hidden) return { ...node, bounds, children: [] };
    if (node.type !== "group") return { ...node, bounds };

    const padding = insets(node);
    const content = {
        x: bounds.x + padding.left,
        y: bounds.y + padding.top,
        width: Math.max(0, bounds.width - padding.left - padding.right),
        height: Math.max(0, bounds.height - padding.top - padding.bottom),
    };
    const children = [...node.children]
        .filter((child) => !child.hidden)
        .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    const resolved: ResolvedSceneNode[] = [];
    const gap = Math.max(0, finite(node.gap, 0));

    if (node.layout === "stack") {
        const horizontal = node.direction === "horizontal";
        const available = Math.max(
            0,
            (horizontal ? content.width : content.height) - gap * Math.max(0, children.length - 1),
        );
        const fixed = children.reduce(
            (sum, child) => sum + finite(horizontal ? child.size?.width : child.size?.height, 0),
            0,
        );
        const remaining = Math.max(0, available - fixed);
        const growTotal = children.reduce((sum, child) => {
            const explicit = horizontal ? child.size?.width : child.size?.height;
            return sum + (explicit ? 0 : Math.max(0, finite(child.size?.grow, 1)));
        }, 0);
        let cursor = horizontal ? content.x : content.y;
        for (const child of children) {
            const explicit = finite(horizontal ? child.size?.width : child.size?.height, 0);
            const extent =
                explicit ||
                (growTotal > 0 ? (remaining * finite(child.size?.grow, 1)) / growTotal : 0);
            const childRect = horizontal
                ? { x: cursor, y: content.y, width: extent, height: content.height }
                : { x: content.x, y: cursor, width: content.width, height: extent };
            const resolvedChild = resolveNode(child, childRect, diagnostics);
            resolved.push(resolvedChild);
            cursor += (horizontal ? resolvedChild.bounds.width : resolvedChild.bounds.height) + gap;
        }
    } else if (node.layout === "grid") {
        const columns = node.columns?.length ? node.columns : [1];
        const rows = node.rows?.length ? node.rows : [1];
        const columnTotal = columns.reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
        const rowTotal = rows.reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
        const columnSpace = Math.max(0, content.width - gap * Math.max(0, columns.length - 1));
        const rowSpace = Math.max(0, content.height - gap * Math.max(0, rows.length - 1));
        const columnWidths = columns.map(
            (value) => (columnSpace * Math.max(0, value)) / columnTotal,
        );
        const rowHeights = rows.map((value) => (rowSpace * Math.max(0, value)) / rowTotal);
        for (const [index, child] of children.entries()) {
            const column = clamp(
                Math.round(child.grid?.column ?? index % columns.length),
                0,
                columns.length - 1,
            );
            const row = clamp(
                Math.round(child.grid?.row ?? Math.floor(index / columns.length)),
                0,
                rows.length - 1,
            );
            const columnSpan = clamp(
                Math.round(child.grid?.columnSpan ?? 1),
                1,
                columns.length - column,
            );
            const rowSpan = clamp(Math.round(child.grid?.rowSpan ?? 1), 1, rows.length - row);
            const x =
                content.x +
                columnWidths.slice(0, column).reduce((sum, value) => sum + value, 0) +
                gap * column;
            const y =
                content.y +
                rowHeights.slice(0, row).reduce((sum, value) => sum + value, 0) +
                gap * row;
            const width =
                columnWidths
                    .slice(column, column + columnSpan)
                    .reduce((sum, value) => sum + value, 0) +
                gap * (columnSpan - 1);
            const height =
                rowHeights.slice(row, row + rowSpan).reduce((sum, value) => sum + value, 0) +
                gap * (rowSpan - 1);
            resolved.push(resolveNode(child, { x, y, width, height }, diagnostics));
        }
    } else {
        for (const child of children) {
            const fallback =
                node.layout === "overlay"
                    ? { x: 0, y: 0, width: content.width, height: content.height }
                    : { x: 0, y: 0, width: 0, height: 0 };
            const local = normalizeRect(child.bounds, fallback);
            const childRect = {
                x: content.x + local.x,
                y: content.y + local.y,
                width: node.layout === "overlay" && !child.bounds ? content.width : local.width,
                height: node.layout === "overlay" && !child.bounds ? content.height : local.height,
            };
            resolved.push(resolveNode(child, childRect, diagnostics));
        }
    }

    for (const child of resolved) {
        if (
            child.bounds.x < bounds.x ||
            child.bounds.y < bounds.y ||
            child.bounds.x + child.bounds.width > bounds.x + bounds.width ||
            child.bounds.y + child.bounds.height > bounds.y + bounds.height
        ) {
            diagnostics.push({
                code: "overflow",
                nodeId: child.id,
                message: "Scene node exceeds its parent bounds",
            });
        }
    }
    return { ...node, bounds, children: resolved };
}

export function resolveScene(
    slide: SceneSlide,
    dimensions: PresentationDimensions,
    profile: SceneResponsiveProfile = "wide",
): ResolvedScene {
    const diagnostics = validateSceneSlide(slide);
    const root = sceneForProfile(slide, profile);
    return {
        slideId: slide.id,
        profile,
        dimensions,
        root: resolveNode(root, { x: 0, y: 0, ...dimensions }, diagnostics),
        diagnostics,
    };
}

function textNode(
    id: string,
    order: number,
    role: "title" | "subtitle" | "body",
    text: string,
): SceneNode {
    return { id, order, type: "text", role, text, minFontSize: 18 };
}

function blockNode(slideId: string, block: SlideBlock, index: number): SceneNode {
    const id = block.id || `${slideId}-block-${index + 1}`;
    if (block.type === "paragraph") return textNode(id, index, "body", block.text);
    if (block.type === "bullets") {
        return textNode(
            id,
            index,
            "body",
            block.items
                .map((item, itemIndex) => `${block.ordered ? `${itemIndex + 1}.` : "•"} ${item}`)
                .join("\n"),
        );
    }
    if (block.type === "image" || block.type === "image-placeholder") {
        return {
            id,
            order: index,
            type: "image",
            url: block.type === "image" ? block.url : undefined,
            alt: block.alt,
            caption: block.caption,
            fit: "cover",
        };
    }
    const kind =
        block.type === "widget" ? (block.kind === "flow" ? "process" : block.kind) : block.type;
    return { id, order: index, type: "widget", kind, version: 1, props: { ...block } };
}

function contentSlideToScene(slide: ContentSlide): SceneSlide {
    const title = textNode(`${slide.id}-title`, 0, "title", slide.title);
    const subtitle = slide.subtitle
        ? [textNode(`${slide.id}-subtitle`, 1, "subtitle", slide.subtitle)]
        : [];
    const blocks = slide.blocks.map((block, index) => blockNode(slide.id, block, index + 2));
    const visualIndex = blocks.findIndex((node) => node.type === "image");
    const visual = visualIndex >= 0 ? blocks[visualIndex] : undefined;
    const body = blocks.filter((_, index) => index !== visualIndex);
    const composition: SceneGroupNode = visual
        ? {
              id: `${slide.id}-composition`,
              type: "group",
              order: 2,
              layout: "grid",
              columns: [1.1, 0.9],
              rows: [1],
              gap: 48,
              children: [
                  {
                      id: `${slide.id}-body`,
                      type: "group",
                      order: 0,
                      layout: "stack",
                      direction: "vertical",
                      gap: 22,
                      grid: { column: 0, row: 0 },
                      children: body,
                  },
                  { ...visual, order: 1, grid: { column: 1, row: 0 } },
              ],
          }
        : {
              id: `${slide.id}-composition`,
              type: "group",
              order: 2,
              layout: "stack",
              direction: "vertical",
              gap: 22,
              children: body,
          };
    return {
        id: slide.id,
        type: "scene",
        strategy: visual ? "legacy-media-split" : "legacy-editorial-stack",
        root: {
            id: `${slide.id}-root`,
            type: "group",
            order: 0,
            layout: "stack",
            direction: "vertical",
            gap: 28,
            padding: { top: 68, right: 76, bottom: 62, left: 76 },
            children: [title, ...subtitle, { ...composition, size: { grow: 1 } }],
        },
        variants: visual
            ? [
                  {
                      profile: "compact",
                      patches: [],
                      root: {
                          ...composition,
                          id: `${slide.id}-compact-root`,
                          layout: "stack",
                          direction: "vertical",
                          padding: { top: 40, right: 36, bottom: 40, left: 36 },
                          children: [title, ...subtitle, ...body, visual],
                      },
                  },
              ]
            : undefined,
    };
}

export function slideToScene(slide: Slide): SceneSlide {
    if (isSceneSlide(slide)) return slide;
    if ("html" in slide) {
        return {
            id: slide.id,
            type: "scene",
            strategy: "legacy-fallback",
            root: {
                id: `${slide.id}-root`,
                type: "group",
                order: 0,
                layout: "stack",
                direction: "vertical",
                padding: { top: 72, right: 80, bottom: 72, left: 80 },
                children: [textNode(`${slide.id}-legacy`, 0, "body", "Legacy slide")],
            },
        };
    }
    if (slide.type === "chart") {
        return {
            id: slide.id,
            type: "scene",
            strategy: "legacy-chart",
            root: {
                id: `${slide.id}-root`,
                type: "group",
                order: 0,
                layout: "stack",
                direction: "vertical",
                padding: { top: 64, right: 72, bottom: 64, left: 72 },
                children: [
                    textNode(`${slide.id}-title`, 0, "title", slide.chartConfig.title || "Chart"),
                    {
                        id: `${slide.id}-chart`,
                        type: "widget",
                        kind: "chart",
                        version: 1,
                        order: 1,
                        size: { grow: 1 },
                        props: { chartConfig: slide.chartConfig },
                    },
                ],
            },
        };
    }
    return contentSlideToScene(slide);
}
