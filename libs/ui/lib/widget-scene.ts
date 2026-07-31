import type {
    WidgetBlock,
    WidgetDirection,
    WidgetEdge,
    WidgetKind,
    WidgetNode,
} from "@slidesage/types";

type WidgetSpecV1 = Pick<WidgetBlock, "version" | "kind" | "direction" | "nodes" | "edges">;

export type WidgetWidth = "full" | "column";

export interface WidgetSceneNode extends WidgetNode {
    x: number;
    y: number;
    width: number;
    height: number;
    labelLines: string[];
    descriptionLines: string[];
}

export interface WidgetSceneEdge extends WidgetEdge {
    key: string;
    points: Array<{ x: number; y: number }>;
    labelX: number;
    labelY: number;
}

export interface WidgetScene {
    width: number;
    height: number;
    kind: WidgetKind;
    direction: WidgetDirection;
    nodes: WidgetSceneNode[];
    edges: WidgetSceneEdge[];
    label: string;
    warning?: string;
}

const KINDS = new Set<WidgetKind>(["timeline", "flow", "architecture", "comparison"]);
const DIRECTIONS = new Set<WidgetDirection>(["horizontal", "vertical"]);
const MAX_NODES = 16;
const MAX_EDGES = 32;

const text = (value: unknown, limit: number) =>
    typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";

const wrapText = (value: string, characters: number, maxLines: number): string[] => {
    if (!value) return [];
    const words = value.split(" ");
    const lines: string[] = [];
    for (const word of words) {
        const current = lines.at(-1);
        if (!current || current.length + word.length + 1 > characters) {
            if (lines.length === maxLines) break;
            lines.push(word.slice(0, characters));
        } else {
            lines[lines.length - 1] = `${current} ${word}`;
        }
    }
    if (lines.join(" ").length < value.length && lines.length > 0) {
        const last = lines.length - 1;
        lines[last] = `${lines[last]?.slice(0, Math.max(1, characters - 1)).trimEnd()}…`;
    }
    return lines;
};

export const isWidgetBlock = (block: unknown): block is WidgetBlock =>
    Boolean(block && typeof block === "object" && (block as { type?: unknown }).type === "widget");

export const normalizeWidgetSpec = (input: unknown): WidgetSpecV1 | null => {
    if (!input || typeof input !== "object") return null;
    const candidate = input as Record<string, unknown>;
    if (
        candidate["version"] !== 1 ||
        !KINDS.has(candidate["kind"] as WidgetKind) ||
        !DIRECTIONS.has(candidate["direction"] as WidgetDirection) ||
        !Array.isArray(candidate["nodes"]) ||
        !Array.isArray(candidate["edges"])
    ) {
        return null;
    }

    const ids = new Set<string>();
    const nodes: WidgetNode[] = [];
    for (const item of candidate["nodes"].slice(0, MAX_NODES)) {
        if (!item || typeof item !== "object") continue;
        const node = item as Record<string, unknown>;
        const id = text(node["id"], 80);
        const label = text(node["label"], 180);
        if (!id || !label || ids.has(id)) continue;
        ids.add(id);
        nodes.push({
            id,
            role: text(node["role"], 60) as WidgetNode["role"],
            label,
            description: text(node["description"], 300),
            value: text(node["value"], 100),
            tone: text(node["tone"], 40) as WidgetNode["tone"],
            parentId: text(node["parentId"], 80),
        });
    }
    if (nodes.length === 0) return null;

    const edges: WidgetEdge[] = [];
    for (const item of candidate["edges"].slice(0, MAX_EDGES)) {
        if (!item || typeof item !== "object") continue;
        const edge = item as Record<string, unknown>;
        const from = text(edge["from"], 80);
        const to = text(edge["to"], 80);
        if (!ids.has(from) || !ids.has(to) || from === to) continue;
        edges.push({ from, to, label: text(edge["label"], 100) });
    }

    return {
        version: 1,
        kind: candidate["kind"] as WidgetKind,
        direction: candidate["direction"] as WidgetDirection,
        nodes,
        edges,
    };
};

const layoutGrid = (
    spec: WidgetSpecV1,
    width: number,
    height: number,
): Array<{ x: number; y: number; width: number; height: number }> => {
    const count = spec.nodes.length;
    const marginX = 34;
    const marginY = 36;
    const gap = spec.kind === "comparison" ? 28 : 22;
    let columns = spec.direction === "horizontal" ? count : 1;
    if (spec.kind === "comparison") columns = Math.min(2, count);
    if (spec.kind === "architecture") {
        const maxDepth = Math.max(...spec.nodes.map((node) => (node.parentId ? 1 : 0)), 0);
        columns = spec.direction === "horizontal" ? maxDepth + 1 : Math.ceil(Math.sqrt(count));
    }
    columns = Math.max(1, Math.min(columns, width < 700 ? 2 : 5));
    const rows = Math.ceil(count / columns);
    const nodeWidth = Math.min(250, (width - marginX * 2 - gap * (columns - 1)) / columns);
    const nodeHeight = Math.min(132, (height - marginY * 2 - gap * (rows - 1)) / rows);

    return spec.nodes.map((_, index) => {
        let column = index % columns;
        let row = Math.floor(index / columns);
        if (spec.direction === "vertical" && spec.kind !== "comparison") {
            const verticalRows = Math.min(count, width < 700 ? 4 : 5);
            const verticalColumns = Math.ceil(count / verticalRows);
            column = Math.floor(index / verticalRows);
            row = index % verticalRows;
            const verticalWidth = Math.min(
                250,
                (width - marginX * 2 - gap * (verticalColumns - 1)) / verticalColumns,
            );
            const verticalHeight = Math.min(
                116,
                (height - marginY * 2 - gap * (verticalRows - 1)) / verticalRows,
            );
            return {
                x: marginX + column * (verticalWidth + gap),
                y: marginY + row * (verticalHeight + gap),
                width: verticalWidth,
                height: verticalHeight,
            };
        }
        return {
            x: marginX + column * (nodeWidth + gap),
            y: marginY + row * (nodeHeight + gap),
            width: nodeWidth,
            height: nodeHeight,
        };
    });
};

const edgePoints = (
    from: WidgetSceneNode,
    to: WidgetSceneNode,
    direction: WidgetDirection,
): Array<{ x: number; y: number }> => {
    if (direction === "vertical") {
        const start = { x: from.x + from.width / 2, y: from.y + from.height };
        const end = { x: to.x + to.width / 2, y: to.y };
        const middle = (start.y + end.y) / 2;
        return [start, { x: start.x, y: middle }, { x: end.x, y: middle }, end];
    }
    const forward = to.x >= from.x;
    const start = { x: forward ? from.x + from.width : from.x, y: from.y + from.height / 2 };
    const end = { x: forward ? to.x : to.x + to.width, y: to.y + to.height / 2 };
    const middle = (start.x + end.x) / 2;
    return [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end];
};

export const compileWidgetScene = (
    input: unknown,
    widthMode: WidgetWidth = "full",
): WidgetScene => {
    const width = widthMode === "full" ? 1120 : 540;
    const height = widthMode === "full" ? 420 : 500;
    const spec = normalizeWidgetSpec(input);
    if (!spec) {
        return {
            width,
            height,
            kind: "flow",
            direction: "horizontal",
            nodes: [],
            edges: [],
            label: "Widget unavailable",
            warning: "This generated widget could not be displayed.",
        };
    }

    const positions = layoutGrid(spec, width, height);
    const nodes: WidgetSceneNode[] = spec.nodes.map((node, index) => {
        const position = positions[index] || { x: 34, y: 36, width: 200, height: 110 };
        const characters = Math.max(12, Math.floor(position.width / 9));
        return {
            ...node,
            ...position,
            labelLines: wrapText(node.label, characters, position.height >= 105 ? 2 : 1),
            descriptionLines: wrapText(
                node.description || "",
                characters + 6,
                position.height >= 120 ? 2 : position.height >= 92 ? 1 : 0,
            ),
        };
    });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const edges: WidgetSceneEdge[] = spec.edges.flatMap((edge, index) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return [];
        const points = edgePoints(from, to, spec.direction);
        const middle = points[Math.floor(points.length / 2)] || points[0] || { x: 0, y: 0 };
        return [
            {
                ...edge,
                key: `${edge.from}-${edge.to}-${index}`,
                points,
                labelX: middle.x,
                labelY: middle.y - 7,
            },
        ];
    });
    const label = `${spec.kind} widget with ${nodes.length} ${nodes.length === 1 ? "item" : "items"}`;
    return { width, height, kind: spec.kind, direction: spec.direction, nodes, edges, label };
};
