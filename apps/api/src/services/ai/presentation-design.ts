import {
    type ContentSlide,
    isContentSlide,
    type PresentationOutline,
    type PresentationOutlineCard,
    type SceneArtDirection,
    type SceneGroupNode,
    type SceneNode,
    type SceneSlide,
    type SlideBlock,
    type SlideRegion,
    type StructuredSlide,
} from "@slidesage/types";

type ContentSlideNode = Extract<StructuredSlide, { type: "content" }>;

const DENSITY = {
    airy: { gap: 30, paddingX: 82, paddingY: 68 },
    standard: { gap: 24, paddingX: 70, paddingY: 58 },
    compact: { gap: 18, paddingX: 58, paddingY: 48 },
} as const;

function stableIndex(slide: ContentSlideNode, salt: string, length: number): number {
    let hash = 2166136261;
    for (const character of `${slide.id}:${slide.title}:${salt}`) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash) % Math.max(1, length);
}

function textNode(
    id: string,
    order: number,
    role: "display" | "title" | "subtitle" | "body" | "label",
    text: string,
    options: { maxLines?: number; align?: "left" | "center" | "right" } = {}
): SceneNode {
    const limits = {
        display: { minFontSize: 34, maxLines: 3 },
        title: { minFontSize: 28, maxLines: 2 },
        subtitle: { minFontSize: 18, maxLines: 3 },
        body: { minFontSize: 16, maxLines: 10 },
        label: { minFontSize: 12, maxLines: 2 },
    }[role];
    return {
        id,
        order,
        type: "text",
        role,
        text,
        minFontSize: limits.minFontSize,
        maxLines: options.maxLines ?? limits.maxLines,
        style: options.align ? { textAlign: options.align } : undefined,
    };
}

function blockNode(slideId: string, block: SlideBlock, order: number): SceneNode {
    const id = block.id || `${slideId}-block-${order}`;
    const semanticSize =
        block.emphasis === "hero"
            ? { grow: 1.7 }
            : block.emphasis === "supporting"
              ? { grow: 0.72 }
              : undefined;
    if (block.type === "paragraph") {
        return { ...textNode(id, order, "body", block.text), size: semanticSize };
    }
    if (block.type === "bullets") {
        return {
            ...textNode(
                id,
                order,
                "body",
                block.items
                    .map((item, index) => `${block.ordered ? `${index + 1}.` : "•"} ${item}`)
                    .join("\n")
            ),
            size: semanticSize,
        };
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
            size: semanticSize,
            style: { radius: block.treatment === "plain" ? 0 : 18 },
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
        size: semanticSize,
        style: { radius: block.treatment === "plain" ? 0 : 16 },
    };
}

function stack(
    id: string,
    order: number,
    children: SceneNode[],
    gap: number,
    options: Partial<SceneGroupNode> = {}
): SceneGroupNode {
    return {
        id,
        order,
        type: "group",
        layout: "stack",
        direction: "vertical",
        gap,
        children: children.map((child, index) => ({ ...child, order: index })),
        ...options,
    };
}

function grid(
    id: string,
    order: number,
    columns: number[],
    rows: number[],
    children: SceneNode[],
    gap: number
): SceneGroupNode {
    return {
        id,
        order,
        type: "group",
        layout: "grid",
        columns,
        rows,
        gap,
        children,
    };
}

function regionStack(
    slide: ContentSlideNode,
    region: SlideRegion,
    nodes: SceneNode[],
    order: number,
    gap: number
): SceneGroupNode {
    const label = slide.regionLabels?.[region];
    const children = label
        ? [textNode(`${slide.id}-${region}-label`, 0, "label", label), ...nodes]
        : nodes;
    return stack(`${slide.id}-${region}`, order, children, gap);
}

function artDirection(
    slide: ContentSlideNode | undefined,
    card: PresentationOutlineCard | undefined
): SceneArtDirection {
    const expressive = card?.narrativeRole === "opening" || card?.narrativeRole === "closing";
    const technical = card?.visualIntent === "chart" || card?.visualIntent === "table";
    const density = slide?.density === "compact" ? "dense" : slide?.density || "balanced";
    return {
        mood: expressive
            ? "editorial"
            : technical
              ? "technical"
              : slide?.layout === "quote" || slide?.layout === "spotlight"
                ? "expressive"
                : slide?.density === "airy"
                  ? "minimal"
                  : "editorial",
        density: density === "standard" ? "balanced" : density,
        imageTreatment: slide?.tone === "muted" ? "soft" : "natural",
        motif:
            slide?.pattern === "grid"
                ? "grid"
                : slide?.pattern === "none"
                  ? expressive
                      ? "frame"
                      : "none"
                  : "rule",
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

function focalPoint(value: ContentSlide["backgroundImage"]): { x: number; y: number } {
    if (value?.focalPoint === "top") return { x: 0.5, y: 0 };
    if (value?.focalPoint === "bottom") return { x: 0.5, y: 1 };
    if (value?.focalPoint === "left") return { x: 0, y: 0.5 };
    if (value?.focalPoint === "right") return { x: 1, y: 0.5 };
    return { x: 0.5, y: 0.5 };
}

function backgroundNode(slide: ContentSlideNode): SceneNode | undefined {
    if (!slide.backgroundImage) return undefined;
    const opacity = { none: 1, subtle: 0.72, medium: 0.5, strong: 0.32 }[
        slide.backgroundImage.overlay
    ];
    return {
        id: `${slide.id}-background`,
        order: 0,
        type: "image",
        url: slide.backgroundImage.url,
        alt: slide.backgroundImage.alt,
        fit: "cover",
        focalPoint: focalPoint(slide.backgroundImage),
        style: { opacity, radius: 0 },
    };
}

function page(
    slide: ContentSlideNode,
    header: SceneNode[],
    composition: SceneNode,
    gapMultiplier = 1
): SceneGroupNode {
    const density = DENSITY[slide.density];
    return stack(
        `${slide.id}-root`,
        0,
        [...header, { ...composition, size: { grow: 1 } }],
        density.gap,
        {
            padding: {
                top: density.paddingY,
                right: density.paddingX,
                bottom: density.paddingY,
                left: density.paddingX,
            },
            gap: density.gap * gapMultiplier,
        }
    );
}

function splitFallback(nodes: SceneNode[]): [SceneNode[], SceneNode[]] {
    if (nodes.length < 2) return [nodes, []];
    const midpoint = Math.ceil(nodes.length / 2);
    return [nodes.slice(0, midpoint), nodes.slice(midpoint)];
}

function compileContentSlide(
    slide: ContentSlideNode,
    card: PresentationOutlineCard | undefined,
    index: number
): SceneSlide {
    const density = DENSITY[slide.density];
    const eyebrow = slide.eyebrow
        ? [textNode(`${slide.id}-eyebrow`, 0, "label", slide.eyebrow)]
        : [];
    const layout = card?.narrativeRole === "opening" ? "cover" : slide.layout;
    const titleRole = layout === "cover" || layout === "section" ? "display" : "title";
    const title = textNode(`${slide.id}-title`, 1, titleRole, slide.title);
    const subtitle = slide.subtitle
        ? [textNode(`${slide.id}-subtitle`, 2, "subtitle", slide.subtitle)]
        : [];
    const header = [...eyebrow, title, ...subtitle];
    let blockNodes = slide.blocks.map((block, blockIndex) => ({
        block,
        node: blockNode(slide.id, block, blockIndex + 3),
    }));
    const needsMedia =
        layout === "media-left" || layout === "media-right" || card?.visualIntent === "image";
    if (needsMedia && !blockNodes.some(({ node }) => node.type === "image")) {
        blockNodes = [
            ...blockNodes,
            {
                block: {
                    type: "image-placeholder",
                    region: "media",
                    alt: `Editorial visual illustrating ${slide.title}`,
                    caption: "",
                },
                node: visualPlaceholder(slide.id, slide.title, blockNodes.length + 3),
            },
        ];
    }
    const byRegion = (region: SlideRegion) =>
        blockNodes.filter(({ block }) => block.region === region).map(({ node }) => node);
    const media = blockNodes.filter(({ node }) => node.type === "image").map(({ node }) => node);
    const nonMedia = blockNodes.filter(({ node }) => node.type !== "image").map(({ node }) => node);
    const main = byRegion("main").filter((node) => node.type !== "image");
    let primary: SceneNode[] = byRegion("primary").filter((node) => node.type !== "image");
    let secondary: SceneNode[] = byRegion("secondary").filter((node) => node.type !== "image");
    const background = backgroundNode(slide);
    let strategy: string = layout;
    let root: SceneGroupNode;

    if (layout === "cover") {
        const coverVisual = background || media[0];
        const supporting = nonMedia;
        const variant = coverVisual
            ? stableIndex(slide, "cover-visual", 2) === 0
                ? "cinematic-cover"
                : "split-cover"
            : card?.narrativeRole === "opening" || stableIndex(slide, "cover-copy", 2) === 0
              ? "typographic-cover"
              : "offset-cover";
        strategy = variant;
        if (variant === "split-cover" && coverVisual) {
            root = {
                ...grid(
                    `${slide.id}-root`,
                    0,
                    [1.12, 0.88],
                    [1],
                    [
                        {
                            ...stack(
                                `${slide.id}-cover-copy`,
                                0,
                                [...header, ...supporting],
                                density.gap
                            ),
                            grid: { column: 0, row: 0 },
                        },
                        { ...coverVisual, order: 1, grid: { column: 1, row: 0 } },
                    ],
                    52
                ),
                padding: { top: 54, right: 58, bottom: 54, left: 72 },
            };
        } else {
            const centered = variant === "offset-cover";
            const copy = stack(
                `${slide.id}-cover-copy`,
                2,
                [...header, ...supporting],
                density.gap,
                {
                    bounds: {
                        x: centered ? 230 : 76,
                        y: centered ? 120 : 126,
                        width: centered ? 820 : coverVisual ? 760 : 1040,
                        height: 470,
                    },
                }
            );
            root = {
                id: `${slide.id}-root`,
                order: 0,
                type: "group",
                layout: "overlay",
                children: [...(coverVisual ? [{ ...coverVisual, order: 0 }] : []), copy],
            };
        }
    } else if (layout === "section") {
        const centered = stableIndex(slide, "section", 2) === 1;
        strategy = centered ? "centered-section" : "indexed-section";
        const sectionTitle = centered
            ? textNode(`${slide.id}-title`, 1, "display", slide.title, { align: "center" })
            : title;
        const sectionHeader = [...eyebrow, sectionTitle, ...subtitle];
        const support = nonMedia.length
            ? stack(`${slide.id}-section-support`, 1, nonMedia, density.gap)
            : textNode(
                  `${slide.id}-section-number`,
                  1,
                  "display",
                  String(index + 1).padStart(2, "0")
              );
        const composition = centered
            ? stack(`${slide.id}-section-copy`, 0, [...sectionHeader, ...nonMedia], density.gap)
            : grid(
                  `${slide.id}-section-grid`,
                  0,
                  [0.42, 1.58],
                  [1],
                  [
                      { ...support, order: 0, grid: { column: 0, row: 0 } },
                      {
                          ...stack(`${slide.id}-section-copy`, 1, sectionHeader, density.gap),
                          grid: { column: 1, row: 0 },
                      },
                  ],
                  50
              );
        root = page(slide, [], composition);
    } else if (layout === "split" || layout === "comparison") {
        const unassigned = [...main];
        if (primary.length === 0 && secondary.length === 0) {
            [primary, secondary] = splitFallback(unassigned);
        } else {
            primary = [...primary, ...unassigned];
        }
        const weighted = stableIndex(slide, layout, 3);
        const columns = weighted === 0 ? [1, 1] : weighted === 1 ? [1.2, 0.8] : [0.8, 1.2];
        strategy = `${layout}-${weighted === 0 ? "balanced" : weighted === 1 ? "primary" : "secondary"}`;
        const composition = grid(
            `${slide.id}-${layout}`,
            3,
            columns,
            [1],
            [
                {
                    ...regionStack(slide, "primary", primary, 0, density.gap),
                    grid: { column: 0, row: 0 },
                },
                {
                    ...regionStack(slide, "secondary", secondary, 1, density.gap),
                    grid: { column: 1, row: 0 },
                },
            ],
            density.gap + 10
        );
        root = page(slide, header, composition);
    } else if (layout === "sidebar") {
        const sidebarRight = stableIndex(slide, "sidebar", 2) === 1;
        const sidebar = secondary.length ? secondary : primary.slice(-1);
        const narrative = [...main, ...(secondary.length ? primary : primary.slice(0, -1))];
        strategy = sidebarRight ? "sidebar-right" : "sidebar-left";
        const sideColumn = sidebarRight ? 1 : 0;
        root = page(
            slide,
            header,
            grid(
                `${slide.id}-sidebar`,
                3,
                sidebarRight ? [1.42, 0.58] : [0.58, 1.42],
                [1],
                [
                    {
                        ...regionStack(slide, "main", narrative, 0, density.gap),
                        grid: { column: sidebarRight ? 0 : 1, row: 0 },
                    },
                    {
                        ...regionStack(slide, "secondary", sidebar, 1, density.gap),
                        grid: { column: sideColumn, row: 0 },
                    },
                ],
                density.gap + 16
            )
        );
    } else if (layout === "media-left" || layout === "media-right") {
        const mediaRight = layout === "media-right";
        strategy = `${layout}-${slide.density}`;
        root = page(
            slide,
            header,
            grid(
                `${slide.id}-media-grid`,
                3,
                mediaRight ? [1.08, 0.92] : [0.92, 1.08],
                [1],
                [
                    {
                        ...stack(`${slide.id}-copy`, mediaRight ? 0 : 1, nonMedia, density.gap),
                        grid: { column: mediaRight ? 0 : 1, row: 0 },
                    },
                    {
                        ...stack(`${slide.id}-media`, mediaRight ? 1 : 0, media, density.gap),
                        grid: { column: mediaRight ? 1 : 0, row: 0 },
                    },
                ],
                density.gap + 20
            )
        );
    } else if (layout === "quote") {
        const quote = nonMedia.find((node) => node.type === "widget" && node.kind === "quote");
        const supporting = nonMedia.filter((node) => node !== quote);
        const quoteHero =
            quote ||
            supporting[0] ||
            textNode(`${slide.id}-quote-empty`, 0, "body", slide.subtitle);
        const splitQuote = supporting.length > 0 && stableIndex(slide, "quote", 2) === 1;
        strategy = splitQuote ? "quote-with-context" : "quote-focus";
        const composition = splitQuote
            ? grid(
                  `${slide.id}-quote-grid`,
                  3,
                  [1.35, 0.65],
                  [1],
                  [
                      { ...quoteHero, order: 0, grid: { column: 0, row: 0 } },
                      {
                          ...stack(
                              `${slide.id}-quote-support`,
                              1,
                              quote ? supporting : supporting.slice(1),
                              density.gap
                          ),
                          grid: { column: 1, row: 0 },
                      },
                  ].filter(Boolean) as SceneNode[],
                  44
              )
            : stack(
                  `${slide.id}-quote-focus`,
                  3,
                  quote ? [quote, ...supporting] : [quoteHero, ...supporting.slice(1)],
                  density.gap
              );
        root = page(slide, header, composition);
    } else if (layout === "spotlight") {
        const heroIndex = blockNodes.findIndex(
            ({ block, node }) =>
                block.emphasis === "hero" || node.type === "widget" || node.type === "image"
        );
        const selectedIndex = heroIndex >= 0 ? heroIndex : 0;
        const hero = blockNodes[selectedIndex]?.node;
        const supporting = blockNodes
            .filter((_, blockIndex) => blockIndex !== selectedIndex)
            .map(({ node }) => node);
        const spotlightHero =
            hero ||
            supporting[0] ||
            textNode(`${slide.id}-spotlight-empty`, 0, "body", slide.subtitle);
        const sideSupport = supporting.length > 0 && stableIndex(slide, "spotlight", 2) === 1;
        strategy = sideSupport ? "spotlight-offset" : "spotlight-centered";
        const composition = sideSupport
            ? grid(
                  `${slide.id}-spotlight-grid`,
                  3,
                  [1.45, 0.55],
                  [1],
                  [
                      { ...spotlightHero, order: 0, grid: { column: 0, row: 0 } },
                      {
                          ...stack(
                              `${slide.id}-spotlight-support`,
                              1,
                              hero ? supporting : supporting.slice(1),
                              density.gap
                          ),
                          grid: { column: 1, row: 0 },
                      },
                  ].filter(Boolean) as SceneNode[],
                  44
              )
            : stack(
                  `${slide.id}-spotlight-focus`,
                  3,
                  hero ? [hero, ...supporting] : [spotlightHero, ...supporting.slice(1)],
                  density.gap
              );
        root = page(slide, header, composition);
    } else if (layout === "canvas") {
        strategy = stableIndex(slide, "canvas", 2) === 0 ? "mosaic-balanced" : "mosaic-featured";
        const columns = strategy === "mosaic-featured" ? [1.3, 0.7] : [1, 1];
        const rows = Array.from({ length: Math.max(1, Math.ceil(blockNodes.length / 2)) }, () => 1);
        const composition = grid(
            `${slide.id}-mosaic`,
            3,
            columns,
            rows,
            blockNodes.map(({ node }, nodeIndex) => ({
                ...node,
                order: nodeIndex,
                grid: { column: nodeIndex % 2, row: Math.floor(nodeIndex / 2) },
            })),
            density.gap
        );
        root = page(slide, header, composition, 0.8);
    } else if (media.length > 0) {
        const mediaRight = stableIndex(slide, "body-media", 2) === 1;
        strategy = mediaRight ? "media-right-adaptive" : "media-left-adaptive";
        root = page(
            slide,
            header,
            grid(
                `${slide.id}-adaptive-media`,
                3,
                mediaRight ? [1.08, 0.92] : [0.92, 1.08],
                [1],
                [
                    {
                        ...stack(`${slide.id}-copy`, mediaRight ? 0 : 1, nonMedia, density.gap),
                        grid: { column: mediaRight ? 0 : 1, row: 0 },
                    },
                    {
                        ...stack(`${slide.id}-media`, mediaRight ? 1 : 0, media, density.gap),
                        grid: { column: mediaRight ? 1 : 0, row: 0 },
                    },
                ],
                density.gap + 20
            )
        );
    } else {
        const useLead = nonMedia.length > 1 && stableIndex(slide, "body", 2) === 1;
        strategy = useLead ? "lead-and-support" : "editorial-stack";
        const composition = useLead
            ? grid(
                  `${slide.id}-body-grid`,
                  3,
                  [1.22, 0.78],
                  [1],
                  [
                      { ...(nonMedia[0] as SceneNode), order: 0, grid: { column: 0, row: 0 } },
                      {
                          ...stack(`${slide.id}-body-support`, 1, nonMedia.slice(1), density.gap),
                          grid: { column: 1, row: 0 },
                      },
                  ],
                  density.gap + 14
              )
            : stack(`${slide.id}-body`, 3, nonMedia, density.gap);
        root = page(slide, header, composition);
    }

    const compactChildren = [...header, ...blockNodes.map(({ node }) => node)].map(
        (node, nodeIndex) => ({
            ...node,
            order: nodeIndex,
        })
    );
    return {
        id: slide.id,
        type: "scene",
        root,
        strategy,
        semantic: {
            title: slide.title,
            subtitle: slide.subtitle,
            requestedLayout: slide.layout,
            resolvedLayout: layout,
            selectedVariant: strategy,
            density: slide.density,
            tone: slide.tone,
            pattern: slide.pattern,
            outlineCardId: card?.id,
            narrativeRole: card?.narrativeRole,
            visualIntent: card?.visualIntent,
        },
        artDirection: artDirection(slide, card),
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
                    gap: 18,
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
            artDirection: artDirection(undefined, outline?.cards[index]),
            semantic: {
                requestedLayout: "chart",
                selectedVariant: "chart-focus",
                outlineCardId: outline?.cards[index]?.id,
            },
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
