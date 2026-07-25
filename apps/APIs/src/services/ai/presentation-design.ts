import {
    isContentSlide,
    type PresentationOutline,
    type PresentationOutlineCard,
    type SceneArtDirection,
    type SceneGroupNode,
    type SceneNode,
    type SceneSlide,
    type SlideBlock,
    type StructuredSlide,
} from "@slide-sage/types";

function textNode(
    id: string,
    order: number,
    role: "display" | "title" | "subtitle" | "body" | "label",
    text: string
): SceneNode {
    return { id, order, type: "text", role, text, minFontSize: role === "body" ? 16 : 22 };
}

function blockNode(slideId: string, block: SlideBlock, order: number): SceneNode {
    const id = block.id || `${slideId}-block-${order}`;
    if (block.type === "paragraph") return textNode(id, order, "body", block.text);
    if (block.type === "bullets") {
        return textNode(
            id,
            order,
            "body",
            block.items
                .map((item, index) => `${block.ordered ? `${index + 1}.` : "•"} ${item}`)
                .join("\n")
        );
    }
    if (block.type === "image" || block.type === "image-placeholder") {
        return {
            id,
            order,
            type: "image",
            url: block.type === "image" ? block.url : undefined,
            alt: block.alt,
            caption: block.caption,
            fit: "cover",
            sourceIds: block.sourceIds,
            style: { radius: 18 },
        };
    }
    const kind =
        block.type === "widget" ? (block.kind === "flow" ? "process" : block.kind) : block.type;
    return {
        id,
        order,
        type: "widget",
        kind,
        version: 1,
        props: { ...block },
        sourceIds: block.sourceIds,
    };
}

function artDirection(card: PresentationOutlineCard | undefined, index: number): SceneArtDirection {
    const expressive = card?.narrativeRole === "opening" || card?.narrativeRole === "closing";
    const technical = card?.visualIntent === "chart" || card?.visualIntent === "table";
    return {
        mood: expressive
            ? "editorial"
            : technical
              ? "technical"
              : index % 3 === 1
                ? "minimal"
                : "expressive",
        density: technical ? "dense" : expressive ? "airy" : "balanced",
        imageTreatment: index % 2 === 0 ? "natural" : "soft",
        motif: expressive ? "frame" : technical ? "grid" : index % 2 === 0 ? "rule" : "none",
    };
}

function visualPlaceholder(slideId: string, title: string, order: number): SceneNode {
    return {
        id: `${slideId}-visual`,
        order,
        type: "image",
        alt: `Editorial visual illustrating ${title}`,
        caption: "",
        fit: "cover",
        style: { radius: 20 },
    };
}

function stack(id: string, order: number, children: SceneNode[], gap = 22): SceneGroupNode {
    return {
        id,
        order,
        type: "group",
        layout: "stack",
        direction: "vertical",
        gap,
        children,
    };
}

function compileContentSlide(
    slide: Extract<StructuredSlide, { type: "content" }>,
    card: PresentationOutlineCard | undefined,
    index: number
): SceneSlide {
    const title = textNode(
        `${slide.id}-title`,
        0,
        card?.narrativeRole === "opening" ? "display" : "title",
        slide.title
    );
    const subtitle = slide.subtitle
        ? [textNode(`${slide.id}-subtitle`, 1, "subtitle", slide.subtitle)]
        : [];
    let nodes = slide.blocks.map((block, blockIndex) => blockNode(slide.id, block, blockIndex + 2));
    const visualIndex = nodes.findIndex((node) => node.type === "image");
    const wantsVisual = card?.visualIntent === "image" || visualIndex >= 0;
    if (wantsVisual && visualIndex < 0) {
        nodes = [...nodes, visualPlaceholder(slide.id, slide.title, nodes.length + 2)];
    }
    const visual = nodes.find((node) => node.type === "image");
    const widgets = nodes.filter((node) => node.type === "widget");
    const copy = nodes.filter((node) => node.type !== "image" && node.type !== "widget");
    const opening = index === 0 || card?.narrativeRole === "opening";
    const comparison = card?.narrativeRole === "comparison";
    const dataLed =
        card?.visualIntent === "chart" ||
        card?.visualIntent === "table" ||
        card?.visualIntent === "stats";

    let strategy = "editorial-stack";
    let content: SceneGroupNode;
    if (opening) {
        strategy = visual ? "cinematic-cover" : "typographic-cover";
        content = {
            id: `${slide.id}-composition`,
            order: 0,
            type: "group",
            layout: "overlay",
            children: [
                ...(visual
                    ? [
                          {
                              ...visual,
                              order: 0,
                              style: { ...visual.style, opacity: 0.42, radius: 0 },
                          } as SceneNode,
                      ]
                    : []),
                {
                    ...stack(`${slide.id}-copy`, 2, [title, ...subtitle, ...copy], 28),
                    bounds: { x: 70, y: 120, width: visual ? 750 : 1050, height: 470 },
                },
            ],
        };
    } else if (comparison) {
        strategy = "comparison-grid";
        const groups = widgets.length ? widgets : copy;
        const comparisonRows = Array.from(
            { length: Math.max(1, Math.ceil(groups.length / 2)) },
            () => 1
        );
        content = {
            id: `${slide.id}-root`,
            order: 0,
            type: "group",
            layout: "stack",
            direction: "vertical",
            padding: { top: 64, right: 70, bottom: 58, left: 70 },
            gap: 26,
            children: [
                title,
                ...subtitle,
                {
                    id: `${slide.id}-comparison`,
                    order: 2,
                    type: "group",
                    layout: "grid",
                    columns: [1, 1],
                    rows: comparisonRows,
                    gap: 28,
                    size: { grow: 1 },
                    children: groups.map((node, groupIndex) => ({
                        ...node,
                        order: groupIndex,
                        grid: { column: groupIndex % 2, row: Math.floor(groupIndex / 2) },
                        style: { ...node.style, radius: 18 },
                    })),
                },
            ],
        };
    } else if (dataLed && widgets.length) {
        strategy = "data-spotlight";
        content = {
            id: `${slide.id}-root`,
            order: 0,
            type: "group",
            layout: "grid",
            columns: [0.72, 1.28],
            rows: [1],
            gap: 42,
            padding: { top: 62, right: 70, bottom: 58, left: 70 },
            children: [
                {
                    ...stack(`${slide.id}-copy`, 0, [title, ...subtitle, ...copy], 24),
                    grid: { column: 0, row: 0 },
                },
                {
                    ...stack(`${slide.id}-data`, 1, widgets, 18),
                    grid: { column: 1, row: 0 },
                },
            ],
        };
    } else if (visual) {
        strategy = index % 2 === 0 ? "media-right" : "media-left";
        const mediaRight = index % 2 === 0;
        content = {
            id: `${slide.id}-root`,
            order: 0,
            type: "group",
            layout: "grid",
            columns: mediaRight ? [1.08, 0.92] : [0.92, 1.08],
            rows: [1],
            gap: 48,
            padding: { top: 58, right: 64, bottom: 58, left: 64 },
            children: [
                {
                    ...stack(
                        `${slide.id}-copy`,
                        mediaRight ? 0 : 1,
                        [title, ...subtitle, ...copy, ...widgets],
                        24
                    ),
                    grid: { column: mediaRight ? 0 : 1, row: 0 },
                },
                {
                    ...visual,
                    order: mediaRight ? 1 : 0,
                    grid: { column: mediaRight ? 1 : 0, row: 0 },
                },
            ],
        };
    } else {
        content = {
            id: `${slide.id}-root`,
            order: 0,
            type: "group",
            layout: "stack",
            direction: "vertical",
            padding: { top: 64, right: 76, bottom: 58, left: 76 },
            gap: 26,
            children: [title, ...subtitle, ...copy, ...widgets].map((node, nodeIndex) => ({
                ...node,
                order: nodeIndex,
                size: nodeIndex >= 2 ? { grow: 1 } : node.size,
            })),
        };
    }

    const root = content.id.endsWith("-root")
        ? content
        : {
              id: `${slide.id}-root`,
              order: 0,
              type: "group" as const,
              layout: "overlay" as const,
              children: [content],
          };
    const compactChildren = [
        title,
        ...subtitle,
        ...copy,
        ...widgets,
        ...(visual ? [visual] : []),
    ].map((node, nodeIndex) => ({ ...node, order: nodeIndex }));
    return {
        id: slide.id,
        type: "scene",
        root,
        strategy,
        semantic: {
            title: slide.title,
            subtitle: slide.subtitle,
            outlineCardId: card?.id,
            narrativeRole: card?.narrativeRole,
            visualIntent: card?.visualIntent,
        },
        artDirection: artDirection(card, index),
        variants: [
            {
                profile: "compact",
                patches: [],
                root: {
                    id: `${slide.id}-compact-root`,
                    order: 0,
                    type: "group",
                    layout: "stack",
                    direction: "vertical",
                    gap: 20,
                    padding: { top: 38, right: 34, bottom: 38, left: 34 },
                    children: compactChildren,
                },
            },
        ],
    };
}

export function compilePresentationScenes(
    slides: StructuredSlide[],
    outline: PresentationOutline | undefined,
    startIndex = 0
): SceneSlide[] {
    return slides.map((slide, localIndex) => {
        const index = startIndex + localIndex;
        if (isContentSlide(slide)) {
            return compileContentSlide(slide, outline?.cards[index], index);
        }
        return {
            id: slide.id,
            type: "scene",
            strategy: "chart-focus",
            artDirection: artDirection(outline?.cards[index], index),
            semantic: { outlineCardId: outline?.cards[index]?.id },
            root: {
                id: `${slide.id}-root`,
                order: 0,
                type: "group",
                layout: "stack",
                direction: "vertical",
                gap: 24,
                padding: { top: 58, right: 68, bottom: 56, left: 68 },
                children: [
                    textNode(`${slide.id}-title`, 0, "title", slide.chartConfig.title || "Chart"),
                    {
                        id: `${slide.id}-chart`,
                        order: 1,
                        type: "widget",
                        kind: "chart",
                        version: 1,
                        size: { grow: 1 },
                        props: { chartConfig: slide.chartConfig },
                    },
                ],
            },
        };
    });
}
