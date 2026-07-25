import PptxGenJS from "pptxgenjs";
import { adaptLegacyHtmlSlide } from "@/lib/legacy-slide-adapter";
import {
    type ChartConfig,
    type ContentSlide,
    isChartSlide,
    isLegacyHtmlSlide,
    isSceneSlide,
    type PresentationData,
    type PresentationDimensions,
    type ResolvedSceneNode,
    resolveScene,
    type SceneSlide,
    type SlideBlock,
} from "@/modules/types/presentation";

const SLIDE_WIDTH = 13.333;
const SLIDE_HEIGHT = 7.5;
const PAGE_MARGIN = 0.65;

interface PptxTheme {
    background: string;
    text: string;
    title: string;
    muted: string;
    accent: string;
    accentAlt: string;
    surface: string;
    headingFont: string;
    bodyFont: string;
}

interface ContentRegion {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface RenderContext {
    slide: PptxGenJS.Slide;
    pptx: PptxGenJS;
    theme: PptxTheme;
    region: ContentRegion;
    cursorY: number;
}

const THEMES: Record<string, PptxTheme> = {
    "modern-dark": {
        background: "0F172A",
        text: "F8FAFC",
        title: "38BDF8",
        muted: "94A3B8",
        accent: "38BDF8",
        accentAlt: "818CF8",
        surface: "1E293B",
        headingFont: "Aptos Display",
        bodyFont: "Aptos",
    },
    "corporate-blue": {
        background: "FFFFFF",
        text: "0F172A",
        title: "1E40AF",
        muted: "475569",
        accent: "2563EB",
        accentAlt: "0EA5E9",
        surface: "EFF6FF",
        headingFont: "Aptos Display",
        bodyFont: "Aptos",
    },
    minimalist: {
        background: "FAFAF9",
        text: "1C1917",
        title: "1C1917",
        muted: "78716C",
        accent: "57534E",
        accentAlt: "A8A29E",
        surface: "E7E5E4",
        headingFont: "Aptos Display",
        bodyFont: "Aptos",
    },
    "creative-studio": {
        background: "FFF1F2",
        text: "2D3748",
        title: "C026D3",
        muted: "4A5568",
        accent: "DB2777",
        accentAlt: "C084FC",
        surface: "FEF3C7",
        headingFont: "Aptos Display",
        bodyFont: "Aptos",
    },
    "elegant-serif": {
        background: "F5F5F4",
        text: "44403C",
        title: "292524",
        muted: "78716C",
        accent: "78716C",
        accentAlt: "A8A29E",
        surface: "E7E5E4",
        headingFont: "Georgia",
        bodyFont: "Aptos",
    },
    "nature-green": {
        background: "F0FDF4",
        text: "14532D",
        title: "15803D",
        muted: "166534",
        accent: "22C55E",
        accentAlt: "84CC16",
        surface: "DCFCE7",
        headingFont: "Aptos Display",
        bodyFont: "Aptos",
    },
};

const cleanText = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();

const estimateTextHeight = (text: string, width: number, fontSize: number) => {
    const charsPerLine = Math.max(12, Math.floor((width * 72) / (fontSize * 0.52)));
    const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
    return Math.max(0.35, lines * (fontSize / 72) * 1.25);
};

const safeFileName = (title: string) => {
    const normalized = cleanText(title || "Untitled Presentation")
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/[. ]+$/g, "")
        .slice(0, 120);

    return `${normalized || "Untitled Presentation"}.pptx`;
};

const getTheme = (themeId: string) => {
    const theme = THEMES[themeId] || THEMES["corporate-blue"];
    if (!theme) throw new Error("The default PowerPoint theme is unavailable.");
    return theme;
};

const addSlideFrame = (
    slide: PptxGenJS.Slide,
    pptx: PptxGenJS,
    theme: PptxTheme,
    slideNumber: number,
) => {
    slide.background = { color: theme.background };
    slide.color = theme.text;
    slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 0.12,
        h: SLIDE_HEIGHT,
        line: { transparency: 100 },
        fill: { color: theme.accent },
        objectName: "Theme accent",
    });
    slide.addText(String(slideNumber), {
        x: 12.25,
        y: 7.08,
        w: 0.45,
        h: 0.18,
        fontFace: theme.bodyFont,
        fontSize: 9,
        color: theme.muted,
        align: "right",
        margin: 0,
        objectName: "Slide number",
    });
};

const sceneColor = (value: string | undefined, fallback: string) => {
    if (!value) return fallback;
    const normalized = value.trim().replace(/^#/, "");
    return /^[0-9a-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : fallback;
};

const renderSceneNode = (
    output: PptxGenJS.Slide,
    pptx: PptxGenJS,
    node: ResolvedSceneNode,
    dimensions: PresentationDimensions,
    theme: PptxTheme,
) => {
    if (node.hidden || node.type === "group") {
        node.children?.forEach((child) => {
            renderSceneNode(output, pptx, child, dimensions, theme);
        });
        return;
    }
    const x = (node.bounds.x / dimensions.width) * SLIDE_WIDTH;
    const y = (node.bounds.y / dimensions.height) * SLIDE_HEIGHT;
    const w = (node.bounds.width / dimensions.width) * SLIDE_WIDTH;
    const h = (node.bounds.height / dimensions.height) * SLIDE_HEIGHT;
    if (node.type === "text") {
        const fallbackSize =
            node.role === "display"
                ? 34
                : node.role === "title"
                  ? 28
                  : node.role === "subtitle"
                    ? 18
                    : 14;
        output.addText(node.text || "", {
            x,
            y,
            w,
            h,
            fontFace:
                node.style?.fontFamily ||
                (node.role === "display" || node.role === "title"
                    ? theme.headingFont
                    : theme.bodyFont),
            fontSize: node.style?.fontSize ? Math.max(8, node.style.fontSize * 0.55) : fallbackSize,
            bold: (node.style?.fontWeight || 400) >= 600,
            color: sceneColor(node.style?.color, node.role === "title" ? theme.title : theme.text),
            margin: 0,
            valign: node.role === "title" || node.role === "display" ? "bottom" : "top",
            breakLine: false,
            fit: "shrink",
            objectName: node.id,
        });
        return;
    }
    if (node.type === "image" && node.url) {
        output.addImage({ path: node.url, x, y, w, h, objectName: node.id });
        return;
    }
    if (node.type === "shape") {
        const shape = node.shape === "ellipse" ? pptx.ShapeType.ellipse : pptx.ShapeType.rect;
        output.addShape(shape, {
            x,
            y,
            w,
            h,
            fill: { color: sceneColor(node.style?.fill, theme.surface) },
            line: {
                color: sceneColor(node.style?.stroke, theme.accent),
                width: node.style?.strokeWidth || 0,
            },
            objectName: node.id,
        });
        return;
    }
    const values = node.props || {};
    if (node.type === "widget" && node.kind === "stats" && Array.isArray(values["items"])) {
        const items = values["items"] as Array<{ value?: string; label?: string }>;
        const itemWidth = w / Math.max(1, items.length);
        items.forEach((item, index) => {
            output.addText(String(item.value || ""), {
                x: x + index * itemWidth,
                y,
                w: itemWidth - 0.08,
                h: h * 0.58,
                fontFace: theme.headingFont,
                fontSize: 26,
                bold: true,
                color: theme.accent,
                margin: 0,
                valign: "bottom",
                objectName: `${node.id}-value-${index}`,
            });
            output.addText(String(item.label || ""), {
                x: x + index * itemWidth,
                y: y + h * 0.62,
                w: itemWidth - 0.08,
                h: h * 0.3,
                fontFace: theme.bodyFont,
                fontSize: 11,
                color: theme.muted,
                margin: 0,
                objectName: `${node.id}-label-${index}`,
            });
        });
        return;
    }
    if (node.type === "widget" && (node.kind === "quote" || node.kind === "callout")) {
        const text = String(values["text"] || "");
        const heading = String(values["heading"] || values["attribution"] || "");
        output.addText(heading ? `${heading}\n${text}` : text, {
            x,
            y,
            w,
            h,
            fontFace: theme.bodyFont,
            fontSize: node.kind === "quote" ? 21 : 15,
            italic: node.kind === "quote",
            color: theme.text,
            fill: node.kind === "callout" ? { color: theme.surface } : undefined,
            line: node.kind === "callout" ? { color: theme.accent, transparency: 40 } : undefined,
            margin: 0.16,
            fit: "shrink",
            objectName: node.id,
        });
        return;
    }
    output.addShape(pptx.ShapeType.roundRect, {
        x,
        y,
        w,
        h,
        fill: { color: theme.surface },
        line: { color: theme.accent, transparency: 45 },
        objectName: node.id,
    });
    output.addText(node.kind || "Widget", {
        x,
        y,
        w,
        h,
        align: "center",
        valign: "middle",
        fontFace: theme.bodyFont,
        fontSize: 13,
        color: theme.muted,
        margin: 0.1,
        objectName: `${node.id}-fallback`,
    });
};

const renderSceneSlide = async (
    pptx: PptxGenJS,
    scene: SceneSlide,
    theme: PptxTheme,
    slideNumber: number,
    dimensions: PresentationDimensions = { width: 1280, height: 720 },
) => {
    const output = pptx.addSlide();
    const artBackground = sceneColor(scene.artDirection?.background, theme.background);
    output.background = { color: artBackground };
    const resolved = resolveScene(scene, dimensions, "wide");
    renderSceneNode(output, pptx, resolved.root, dimensions, theme);
    output.addText(String(slideNumber), {
        x: 12.25,
        y: 7.08,
        w: 0.45,
        h: 0.18,
        fontFace: theme.bodyFont,
        fontSize: 9,
        color: theme.muted,
        align: "right",
        margin: 0,
        objectName: "Slide number",
    });
};

const addTitle = (
    slide: PptxGenJS.Slide,
    theme: PptxTheme,
    title: string,
    centered: boolean,
    y = 0.55,
) => {
    const fontSize = centered ? 32 : 27;
    const h = Math.min(1.25, estimateTextHeight(title, 12, fontSize));
    slide.addText(title, {
        x: PAGE_MARGIN,
        y,
        w: SLIDE_WIDTH - PAGE_MARGIN * 2,
        h,
        fontFace: theme.headingFont,
        fontSize,
        bold: true,
        color: theme.title,
        align: centered ? "center" : "left",
        valign: "middle",
        margin: 0,
        fit: "shrink",
        breakLine: false,
        objectName: "Slide title",
    });
    return y + h;
};

const addSubtitle = (
    slide: PptxGenJS.Slide,
    theme: PptxTheme,
    subtitle: string,
    centered: boolean,
    y: number,
) => {
    const h = Math.min(0.85, estimateTextHeight(subtitle, 11.5, 19));
    slide.addText(subtitle, {
        x: 1,
        y,
        w: SLIDE_WIDTH - 2,
        h,
        fontFace: theme.bodyFont,
        fontSize: 19,
        color: theme.muted,
        align: centered ? "center" : "left",
        valign: "middle",
        margin: 0,
        fit: "shrink",
        objectName: "Slide subtitle",
    });
    return y + h;
};

const addParagraph = (
    context: RenderContext,
    text: string,
    options: { bold?: boolean; italic?: boolean; color?: string; fontSize?: number } = {},
) => {
    if (!text || context.cursorY >= context.region.y + context.region.h) return;

    const fontSize = options.fontSize || 17;
    const availableHeight = context.region.y + context.region.h - context.cursorY;
    const h = Math.min(
        availableHeight,
        Math.max(0.42, estimateTextHeight(text, context.region.w, fontSize)),
    );
    context.slide.addText(text, {
        x: context.region.x,
        y: context.cursorY,
        w: context.region.w,
        h,
        fontFace: context.theme.bodyFont,
        fontSize,
        bold: options.bold,
        italic: options.italic,
        color: options.color || context.theme.text,
        valign: "top",
        margin: 0,
        breakLine: false,
        fit: "shrink",
        objectName: "Content text",
    });
    context.cursorY += h + 0.12;
};

const blobToDataUri = async (blob: Blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const chunkSize = 8192;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
};

const addStructuredList = (
    context: RenderContext,
    block: Extract<SlideBlock, { type: "bullets" }>,
) => {
    const fontSize = block.items.length > 7 ? 14 : 17;
    const availableHeight = context.region.y + context.region.h - context.cursorY;
    const estimatedHeight = block.items.reduce(
        (height, item) =>
            height + Math.max(0.34, estimateTextHeight(item, context.region.w, fontSize)),
        0,
    );
    const height = Math.min(availableHeight, estimatedHeight + 0.15);
    const runs: PptxGenJS.TextProps[] = block.items.map((item, index) => ({
        text: item,
        options: {
            bullet: block.ordered
                ? { type: "number", numberStartAt: index + 1, indent: 22 }
                : { type: "bullet", indent: 22 },
            breakLine: index < block.items.length - 1,
            color: context.theme.text,
            fontFace: context.theme.bodyFont,
            fontSize,
        },
    }));

    context.slide.addText(runs, {
        x: context.region.x + 0.12,
        y: context.cursorY,
        w: context.region.w - 0.12,
        h: height,
        margin: 0,
        valign: "top",
        fit: "shrink",
        paraSpaceAfter: 10,
        objectName: block.ordered ? "Numbered list" : "Bullet list",
    });
    context.cursorY += height + 0.12;
};

const addStructuredTable = (
    context: RenderContext,
    block: Extract<SlideBlock, { type: "table" }>,
) => {
    const sourceRows = [block.headers, ...block.rows];
    const columnCount = block.headers.length;
    if (columnCount === 0) return;

    const rows: PptxGenJS.TableRow[] = sourceRows.map((row, rowIndex) =>
        block.headers.map((_, columnIndex) => ({
            text: row[columnIndex] || "",
            options: {
                bold: rowIndex === 0,
                color: rowIndex === 0 ? context.theme.background : context.theme.text,
                fill: {
                    color:
                        rowIndex === 0
                            ? context.theme.accent
                            : rowIndex % 2 === 0
                              ? context.theme.surface
                              : context.theme.background,
                },
                margin: 0.08,
                valign: "middle",
            },
        })),
    );
    const availableHeight = context.region.y + context.region.h - context.cursorY;
    const height = Math.min(availableHeight, Math.max(0.9, sourceRows.length * 0.48));

    context.slide.addTable(rows, {
        x: context.region.x,
        y: context.cursorY,
        w: context.region.w,
        h: height,
        colW: Array(columnCount).fill(context.region.w / columnCount),
        rowH: height / sourceRows.length,
        fontFace: context.theme.bodyFont,
        fontSize: sourceRows.length > 8 || columnCount > 5 ? 11 : 14,
        color: context.theme.text,
        border: { type: "solid", color: context.theme.muted, pt: 0.5 },
        margin: 0.08,
        valign: "middle",
        autoPage: false,
        objectName: "Data table",
    });
    context.cursorY += height + 0.15;
};

const addStructuredImage = async (
    context: RenderContext,
    block: Extract<SlideBlock, { type: "image" }>,
) => {
    const availableHeight = context.region.y + context.region.h - context.cursorY;
    const height = Math.min(availableHeight, 2.7);
    if (height < 0.45) return;

    try {
        const response = await fetch(block.url);
        if (!response.ok) throw new Error(`Image request failed with ${response.status}`);
        const data = await blobToDataUri(await response.blob());
        context.slide.addImage({
            data,
            x: context.region.x,
            y: context.cursorY,
            w: context.region.w,
            h: height,
            sizing: { type: "contain", w: context.region.w, h: height },
            altText: block.alt,
            objectName: block.alt,
        });
    } catch {
        context.slide.addShape(context.pptx.ShapeType.rect, {
            x: context.region.x,
            y: context.cursorY,
            w: context.region.w,
            h: height,
            fill: { color: context.theme.surface },
            line: { color: context.theme.accent, transparency: 45, pt: 1 },
            objectName: "Unavailable image placeholder",
        });
        context.slide.addText(block.alt, {
            x: context.region.x + 0.2,
            y: context.cursorY + 0.2,
            w: context.region.w - 0.4,
            h: height - 0.4,
            fontFace: context.theme.bodyFont,
            fontSize: 15,
            color: context.theme.muted,
            align: "center",
            valign: "middle",
            fit: "shrink",
            margin: 0,
            objectName: "Image alternative text",
        });
    }
    context.cursorY += height + 0.12;
    if (block.caption) {
        addParagraph(context, block.caption, { color: context.theme.muted, fontSize: 11 });
    }
};

const addStructuredImagePlaceholder = (
    context: RenderContext,
    block: Extract<SlideBlock, { type: "image-placeholder" }>,
) => {
    const availableHeight = context.region.y + context.region.h - context.cursorY;
    const height = Math.min(availableHeight, 2.7);
    if (height < 0.45) return;

    context.slide.addShape(context.pptx.ShapeType.rect, {
        x: context.region.x,
        y: context.cursorY,
        w: context.region.w,
        h: height,
        fill: { color: context.theme.surface },
        line: { color: context.theme.accent, transparency: 25, pt: 1.25 },
        objectName: "Image placeholder",
    });
    context.slide.addText([block.alt, block.caption].filter(Boolean).join("\n"), {
        x: context.region.x + 0.3,
        y: context.cursorY + 0.3,
        w: context.region.w - 0.6,
        h: height - 0.6,
        fontFace: context.theme.bodyFont,
        fontSize: 16,
        color: context.theme.muted,
        align: "center",
        valign: "middle",
        fit: "shrink",
        margin: 0,
        objectName: "Image placeholder description",
    });
    context.cursorY += height + 0.12;
};

const addStructuredEmphasis = (
    context: RenderContext,
    text: string,
    options: { quote?: boolean; heading?: string; attribution?: string } = {},
) => {
    const body = [options.heading, text, options.attribution].filter(Boolean).join("\n");
    const availableHeight = context.region.y + context.region.h - context.cursorY;
    const height = Math.min(
        availableHeight,
        Math.max(
            0.9,
            estimateTextHeight(body, context.region.w - 0.5, options.quote ? 22 : 18) + 0.35,
        ),
    );
    context.slide.addShape(context.pptx.ShapeType.roundRect, {
        x: context.region.x,
        y: context.cursorY,
        w: context.region.w,
        h: height,
        rectRadius: 0.06,
        fill: { color: context.theme.surface },
        line: { color: context.theme.accent, pt: options.quote ? 2 : 1 },
        objectName: options.quote ? "Quote background" : "Callout background",
    });
    context.slide.addText(body, {
        x: context.region.x + 0.28,
        y: context.cursorY + 0.12,
        w: context.region.w - 0.56,
        h: height - 0.24,
        fontFace: options.quote ? context.theme.headingFont : context.theme.bodyFont,
        fontSize: options.quote ? 22 : 18,
        bold: !options.quote,
        italic: options.quote,
        color: options.quote ? context.theme.title : context.theme.text,
        align: "center",
        valign: "middle",
        margin: 0,
        fit: "shrink",
        objectName: options.quote ? "Quote" : "Callout",
    });
    context.cursorY += height + 0.15;
};

const addStructuredStats = (
    context: RenderContext,
    block: Extract<SlideBlock, { type: "stats" }>,
) => {
    const count = Math.max(block.items.length, 1);
    const gap = 0.15;
    const itemWidth = (context.region.w - gap * (count - 1)) / count;
    const height = Math.min(1.45, context.region.y + context.region.h - context.cursorY);
    block.items.forEach((item, index) => {
        const x = context.region.x + index * (itemWidth + gap);
        context.slide.addShape(context.pptx.ShapeType.roundRect, {
            x,
            y: context.cursorY,
            w: itemWidth,
            h: height,
            rectRadius: 0.05,
            fill: { color: context.theme.surface },
            line: { color: context.theme.accent, transparency: 35, pt: 1 },
            objectName: `Statistic ${index + 1} background`,
        });
        context.slide.addText(`${item.value}\n${item.label}`, {
            x: x + 0.12,
            y: context.cursorY + 0.1,
            w: itemWidth - 0.24,
            h: height - 0.2,
            fontFace: context.theme.bodyFont,
            fontSize: 17,
            bold: true,
            color: context.theme.title,
            align: "center",
            valign: "middle",
            fit: "shrink",
            margin: 0,
            objectName: `Statistic ${index + 1}`,
        });
    });
    context.cursorY += height + 0.15;
};

const renderStructuredBlock = async (context: RenderContext, block: SlideBlock) => {
    if (context.cursorY >= context.region.y + context.region.h) return;
    switch (block.type) {
        case "paragraph":
            addParagraph(context, block.text);
            return;
        case "bullets":
            addStructuredList(context, block);
            return;
        case "table":
            addStructuredTable(context, block);
            return;
        case "image":
            await addStructuredImage(context, block);
            return;
        case "image-placeholder":
            addStructuredImagePlaceholder(context, block);
            return;
        case "quote":
            addStructuredEmphasis(context, block.text, {
                quote: true,
                attribution: block.attribution,
            });
            return;
        case "callout":
            addStructuredEmphasis(context, block.text, { heading: block.heading });
            return;
        case "stats":
            addStructuredStats(context, block);
            return;
    }
};

const renderStructuredRegion = async (
    slide: PptxGenJS.Slide,
    pptx: PptxGenJS,
    theme: PptxTheme,
    blocks: SlideBlock[],
    region: ContentRegion,
) => {
    const context: RenderContext = { slide, pptx, theme, region, cursorY: region.y };
    for (const block of blocks) await renderStructuredBlock(context, block);
};

const renderStructuredSlide = async (
    pptx: PptxGenJS,
    slideData: ContentSlide,
    theme: PptxTheme,
    slideNumber: number,
) => {
    const slide = pptx.addSlide();
    addSlideFrame(slide, pptx, theme, slideNumber);
    const centered = slideData.layout === "title" || slideData.layout === "quote";
    let contentY = centered ? 1.8 : 0.55;
    contentY = addTitle(slide, theme, cleanText(slideData.title), centered, contentY);
    if (slideData.subtitle) {
        contentY = addSubtitle(
            slide,
            theme,
            cleanText(slideData.subtitle),
            centered,
            contentY + 0.1,
        );
    }
    if (slideData.layout === "title" && slideData.blocks.length === 0) return;

    const top = Math.max(contentY + 0.22, centered ? 2.85 : 1.65);
    const availableWidth = SLIDE_WIDTH - PAGE_MARGIN * 2;
    if (slideData.layout === "two-column" || slideData.layout === "image-right") {
        const gap = 0.42;
        const columnWidth = (availableWidth - gap) / 2;
        const leftRegion = {
            x: PAGE_MARGIN,
            y: top,
            w: columnWidth,
            h: 6.85 - top,
        };
        const rightRegion = {
            ...leftRegion,
            x: PAGE_MARGIN + columnWidth + gap,
        };
        const leftBlocks = slideData.blocks.filter((block) =>
            slideData.layout === "image-right"
                ? block.region === "main" || block.region === "left"
                : block.region === "left",
        );
        const rightBlocks = slideData.blocks.filter((block) => block.region === "right");
        await renderStructuredRegion(slide, pptx, theme, leftBlocks, leftRegion);
        await renderStructuredRegion(slide, pptx, theme, rightBlocks, rightRegion);
        return;
    }

    await renderStructuredRegion(
        slide,
        pptx,
        theme,
        slideData.blocks.filter((block) => block.region === "main"),
        {
            x: PAGE_MARGIN,
            y: top,
            w: availableWidth,
            h: 6.85 - top,
        },
    );
};

const normalizeColor = (color: string | string[] | undefined, fallback: string) => {
    const value = Array.isArray(color) ? color[0] : color;
    const match = value?.match(/^#?([0-9a-f]{6})$/i);
    return match?.[1]?.toUpperCase() || fallback;
};

const renderChartSlide = (
    pptx: PptxGenJS,
    chartConfig: ChartConfig,
    theme: PptxTheme,
    slideNumber: number,
) => {
    const slide = pptx.addSlide();
    addSlideFrame(slide, pptx, theme, slideNumber);
    const title = cleanText(chartConfig.title) || "Data visualization";
    const contentY = addTitle(slide, theme, title, false);
    const description = cleanText(chartConfig.description);
    const chartHeight = description ? 4.75 : 5.25;
    const chartType: PptxGenJS.CHART_NAME =
        chartConfig.type === "polarArea" ? "radar" : chartConfig.type;
    const chartColors = chartConfig.data.datasets.map((dataset, index) =>
        normalizeColor(
            dataset.backgroundColor || dataset.borderColor,
            [theme.accent, theme.accentAlt, theme.title, theme.muted][index % 4] || theme.accent,
        ),
    );
    const series = chartConfig.data.datasets.map((dataset, index) => ({
        name: cleanText(dataset.label) || `Series ${index + 1}`,
        labels: chartConfig.data.labels.map((label) => cleanText(label)),
        values: dataset.data.map((value) => Number(value) || 0),
    }));

    slide.addChart(chartType, series, {
        x: PAGE_MARGIN,
        y: Math.max(contentY + 0.18, 1.5),
        w: SLIDE_WIDTH - PAGE_MARGIN * 2,
        h: chartHeight,
        showTitle: false,
        showLegend: series.length > 1 || ["pie", "doughnut"].includes(chartType),
        legendPos: "b",
        legendColor: theme.text,
        legendFontFace: theme.bodyFont,
        legendFontSize: 12,
        chartColors,
        showValue: ["pie", "doughnut"].includes(chartType),
        showPercent: ["pie", "doughnut"].includes(chartType),
        dataLabelColor: theme.text,
        dataLabelPosition: "bestFit",
        catAxisLabelColor: theme.muted,
        catAxisLabelFontFace: theme.bodyFont,
        catAxisLabelFontSize: 11,
        valAxisLabelColor: theme.muted,
        valAxisLabelFontFace: theme.bodyFont,
        valAxisLabelFontSize: 11,
        catAxisLineColor: theme.muted,
        valAxisLineColor: theme.muted,
        catGridLine: { color: theme.muted, size: 0.5 },
        valGridLine: { color: theme.muted, size: 0.5 },
        showSerName: false,
        border: { color: theme.muted, pt: 0.75 },
        objectName: `${title} chart`,
        altText: description || title,
    });

    if (description) {
        slide.addText(description, {
            x: 1,
            y: 6.55,
            w: SLIDE_WIDTH - 2,
            h: 0.38,
            fontFace: theme.bodyFont,
            fontSize: 12,
            color: theme.muted,
            align: "center",
            margin: 0,
            fit: "shrink",
            objectName: "Chart description",
        });
    }
};

export const buildEditablePptx = async (presentation: PresentationData) => {
    const pptx = new PptxGenJS();
    const theme = getTheme(presentation.theme);

    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "Slide Sage";
    pptx.company = "Slide Sage";
    pptx.subject = "Editable presentation exported from Slide Sage";
    pptx.title = cleanText(presentation.title) || "Untitled Presentation";
    pptx.theme = {
        headFontFace: theme.headingFont,
        bodyFontFace: theme.bodyFont,
    };

    for (const [index, slide] of presentation.slides.entries()) {
        if (isSceneSlide(slide)) {
            await renderSceneSlide(pptx, slide, theme, index + 1, presentation.dimensions);
            continue;
        }
        if (isChartSlide(slide)) {
            renderChartSlide(pptx, slide.chartConfig, theme, index + 1);
            continue;
        }

        const contentSlide = isLegacyHtmlSlide(slide) ? adaptLegacyHtmlSlide(slide) : slide;
        await renderStructuredSlide(pptx, contentSlide, theme, index + 1);
    }

    return pptx;
};

export const exportEditablePptx = async (presentation: PresentationData) => {
    if (presentation.slides.length === 0) {
        throw new Error("The presentation has no slides to export.");
    }

    const pptx = await buildEditablePptx(presentation);
    await pptx.writeFile({
        fileName: safeFileName(presentation.title),
        compression: true,
    });
};
