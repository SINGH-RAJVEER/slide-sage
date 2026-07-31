import { adaptLegacyHtmlSlide } from "@slidesage/ui/lib/legacy-slide-adapter";
import { compileWidgetScene, isWidgetBlock } from "@slidesage/ui/lib/widget-scene";
import PptxGenJS from "pptxgenjs";
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
    type SlideRegion,
    type WidgetBlockLike,
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
    fontScale?: number;
    fillMedia?: boolean;
}

interface HeaderOptions {
    centered?: boolean;
    titleSize?: number;
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

const themeForTone = (theme: PptxTheme, tone: ContentSlide["tone"]): PptxTheme => {
    if (tone === "inverse") {
        return {
            ...theme,
            background: theme.text,
            text: theme.background,
            title: theme.background,
            muted: theme.surface,
            surface: theme.title,
        };
    }
    if (tone === "accent") return { ...theme, background: theme.surface };
    if (tone === "muted") return { ...theme, text: theme.muted };
    return theme;
};

const addPattern = (
    slide: PptxGenJS.Slide,
    pptx: PptxGenJS,
    theme: PptxTheme,
    pattern: ContentSlide["pattern"],
) => {
    const line = { color: theme.muted, transparency: 82, pt: 0.5 };
    if (pattern === "grid") {
        for (let x = 0.75; x < SLIDE_WIDTH; x += 0.75) {
            slide.addShape(pptx.ShapeType.line, { x, y: 0, w: 0, h: SLIDE_HEIGHT, line });
        }
        for (let y = 0.75; y < SLIDE_HEIGHT; y += 0.75) {
            slide.addShape(pptx.ShapeType.line, { x: 0, y, w: SLIDE_WIDTH, h: 0, line });
        }
    } else if (pattern === "dots") {
        for (let x = 0.65; x < SLIDE_WIDTH; x += 0.65) {
            for (let y = 0.65; y < SLIDE_HEIGHT; y += 0.65) {
                slide.addShape(pptx.ShapeType.ellipse, {
                    x,
                    y,
                    w: 0.025,
                    h: 0.025,
                    line: { transparency: 100 },
                    fill: { color: theme.muted, transparency: 72 },
                });
            }
        }
    } else if (pattern === "diagonal") {
        for (let x = -SLIDE_HEIGHT; x < SLIDE_WIDTH; x += 0.7) {
            slide.addShape(pptx.ShapeType.line, {
                x,
                y: SLIDE_HEIGHT,
                w: SLIDE_HEIGHT,
                h: -SLIDE_HEIGHT,
                line,
            });
        }
    }
};

const addBackgroundImage = async (
    slide: PptxGenJS.Slide,
    pptx: PptxGenJS,
    background: NonNullable<ContentSlide["backgroundImage"]>,
    theme: PptxTheme,
) => {
    try {
        const response = await fetch(background.url);
        if (!response.ok) return;
        const data = await blobToDataUri(await response.blob());
        slide.addImage({
            data,
            x: 0,
            y: 0,
            w: SLIDE_WIDTH,
            h: SLIDE_HEIGHT,
            sizing: { type: "cover", w: SLIDE_WIDTH, h: SLIDE_HEIGHT },
            altText: background.alt,
            objectName: "Slide background image",
        });
        const transparency =
            background.overlay === "subtle"
                ? 72
                : background.overlay === "medium"
                  ? 48
                  : background.overlay === "strong"
                    ? 24
                    : undefined;
        if (transparency !== undefined) {
            slide.addShape(pptx.ShapeType.rect, {
                x: 0,
                y: 0,
                w: SLIDE_WIDTH,
                h: SLIDE_HEIGHT,
                line: { transparency: 100 },
                fill: { color: theme.background, transparency },
                objectName: "Background image overlay",
            });
        }
    } catch {
        // The slide remains fully editable and uses its tone background if remote media is unavailable.
    }
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
            fontSize: node.style?.fontSize ? Math.max(8, node.style.fontSize * 0.75) : fallbackSize,
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
    if (node.type === "widget" && node.kind === "chart") {
        const chartConfig = values["chartConfig"] as ChartConfig | undefined;
        if (chartConfig) {
            const chartType: PptxGenJS.CHART_NAME =
                chartConfig.type === "polarArea" ? "radar" : chartConfig.type;
            const series = chartConfig.data.datasets.map((dataset, index) => ({
                name: cleanText(dataset.label) || `Series ${index + 1}`,
                labels: chartConfig.data.labels.map((label) => cleanText(label)),
                values: dataset.data.map((value) => Number(value) || 0),
            }));
            output.addChart(chartType, series, {
                x,
                y,
                w,
                h,
                showTitle: false,
                showLegend: series.length > 1 || ["pie", "doughnut"].includes(chartType),
                legendPos: "b",
                legendColor: theme.text,
                chartColors: chartConfig.data.datasets.map((dataset, index) =>
                    normalizeColor(
                        dataset.backgroundColor || dataset.borderColor,
                        [theme.accent, theme.accentAlt, theme.title, theme.muted][index % 4] ||
                            theme.accent,
                    ),
                ),
                catAxisLabelColor: theme.muted,
                valAxisLabelColor: theme.muted,
                border: { color: theme.muted, pt: 0.75 },
                objectName: node.id,
                altText: chartConfig.description || chartConfig.title || "Chart",
            });
            return;
        }
    }
    if (
        node.type === "widget" &&
        node.kind === "table" &&
        Array.isArray(values["headers"]) &&
        Array.isArray(values["rows"])
    ) {
        addStructuredTable(
            {
                slide: output,
                pptx,
                theme,
                region: { x, y, w, h },
                cursorY: y,
            },
            values as unknown as Extract<SlideBlock, { type: "table" }>,
        );
        return;
    }
    if (
        node.type === "widget" &&
        ["timeline", "process", "comparison", "architecture"].includes(node.kind || "") &&
        values["type"] === "widget"
    ) {
        addStructuredWidget(
            {
                slide: output,
                pptx,
                theme,
                region: { x, y, w, h },
                cursorY: y,
            },
            values as unknown as WidgetBlockLike,
        );
        return;
    }
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

const addHeader = (
    slide: PptxGenJS.Slide,
    theme: PptxTheme,
    slideData: ContentSlide,
    region: ContentRegion,
    options: HeaderOptions = {},
) => {
    let y = region.y;
    if (slideData.eyebrow) {
        slide.addText(cleanText(slideData.eyebrow).toUpperCase(), {
            x: region.x,
            y,
            w: region.w,
            h: 0.22,
            fontFace: theme.bodyFont,
            fontSize: 9,
            bold: true,
            charSpacing: 2.2,
            color: theme.muted,
            align: options.centered ? "center" : "left",
            margin: 0,
            fit: "shrink",
            objectName: "Slide eyebrow",
        });
        y += 0.31;
    }
    const titleSize = options.titleSize || 27;
    const titleHeight = Math.min(1.55, estimateTextHeight(slideData.title, region.w, titleSize));
    slide.addText(cleanText(slideData.title), {
        x: region.x,
        y,
        w: region.w,
        h: titleHeight,
        fontFace: theme.headingFont,
        fontSize: titleSize,
        bold: true,
        color: theme.title,
        align: options.centered ? "center" : "left",
        valign: "middle",
        margin: 0,
        fit: "shrink",
        objectName: "Slide title",
    });
    y += titleHeight;
    if (slideData.subtitle) {
        const subtitleHeight = Math.min(0.7, estimateTextHeight(slideData.subtitle, region.w, 16));
        slide.addText(cleanText(slideData.subtitle), {
            x: region.x,
            y: y + 0.1,
            w: region.w,
            h: subtitleHeight,
            fontFace: theme.bodyFont,
            fontSize: 16,
            color: theme.muted,
            align: options.centered ? "center" : "left",
            margin: 0,
            fit: "shrink",
            objectName: "Slide subtitle",
        });
        y += subtitleHeight + 0.1;
    }
    return y;
};

const addParagraph = (
    context: RenderContext,
    text: string,
    options: { bold?: boolean; italic?: boolean; color?: string; fontSize?: number } = {},
) => {
    if (!text || context.cursorY >= context.region.y + context.region.h) return;

    const fontSize = (options.fontSize || 17) * (context.fontScale || 1);
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
    const fontSize = (block.items.length > 7 ? 14 : 17) * (context.fontScale || 1);
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
    const height = context.fillMedia ? availableHeight : Math.min(availableHeight, 2.7);
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
    const height = context.fillMedia ? availableHeight : Math.min(availableHeight, 2.7);
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
            estimateTextHeight(
                body,
                context.region.w - 0.5,
                (options.quote ? 22 : 18) * (context.fontScale || 1),
            ) + 0.35,
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
        fontSize: (options.quote ? 22 : 18) * (context.fontScale || 1),
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
            fontSize: 17 * (context.fontScale || 1),
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

const addStructuredWidget = (context: RenderContext, block: WidgetBlockLike) => {
    const widthMode = context.region.w < 7 ? "column" : "full";
    const scene = compileWidgetScene(block, widthMode);
    const availableHeight = context.region.y + context.region.h - context.cursorY;
    const height = Math.min(availableHeight, widthMode === "column" ? 4.4 : 3.9);
    if (height < 0.5) {
        context.slide.addText("Widget could not fit in the remaining content area.", {
            x: context.region.x,
            y: Math.max(context.region.y, context.region.y + context.region.h - 0.35),
            w: context.region.w,
            h: 0.35,
            fontFace: context.theme.bodyFont,
            fontSize: 10,
            color: context.theme.muted,
            align: "center",
            fit: "shrink",
            margin: 0,
            objectName: "Widget overflow notice",
        });
        return;
    }

    if (scene.warning) {
        context.slide.addShape(context.pptx.ShapeType.rect, {
            x: context.region.x,
            y: context.cursorY,
            w: context.region.w,
            h: Math.min(height, 1.1),
            fill: { color: context.theme.surface },
            line: { color: context.theme.accent, pt: 1 },
            objectName: "Widget unavailable",
        });
        context.slide.addText(scene.warning, {
            x: context.region.x + 0.2,
            y: context.cursorY + 0.1,
            w: context.region.w - 0.4,
            h: Math.min(height, 1.1) - 0.2,
            fontFace: context.theme.bodyFont,
            fontSize: 14,
            color: context.theme.muted,
            align: "center",
            valign: "middle",
            fit: "shrink",
            margin: 0,
            objectName: "Widget error message",
        });
        context.cursorY += Math.min(height, 1.1) + 0.15;
        return;
    }

    const scaleX = context.region.w / scene.width;
    const scaleY = height / scene.height;
    const x = (value: number) => context.region.x + value * scaleX;
    const y = (value: number) => context.cursorY + value * scaleY;
    for (const [edgeIndex, edge] of scene.edges.entries()) {
        edge.points.slice(0, -1).forEach((point, pointIndex) => {
            const next = edge.points[pointIndex + 1];
            if (!next) return;
            context.slide.addShape(context.pptx.ShapeType.line, {
                x: x(point.x),
                y: y(point.y),
                w: x(next.x) - x(point.x),
                h: y(next.y) - y(point.y),
                line: {
                    color: context.theme.accent,
                    pt: 1.5,
                    endArrowType: pointIndex === edge.points.length - 2 ? "triangle" : undefined,
                },
                objectName: `Widget connector ${edgeIndex + 1}`,
            });
        });
        if (edge.label) {
            context.slide.addText(edge.label, {
                x: x(edge.labelX) - 0.6,
                y: y(edge.labelY) - 0.12,
                w: 1.2,
                h: 0.22,
                fontFace: context.theme.bodyFont,
                fontSize: 9,
                color: context.theme.muted,
                align: "center",
                margin: 0,
                fit: "shrink",
                objectName: `Widget connector label ${edgeIndex + 1}`,
            });
        }
    }
    scene.nodes.forEach((node, index) => {
        const nodeX = x(node.x);
        const nodeY = y(node.y);
        const nodeWidth = node.width * scaleX;
        const nodeHeight = node.height * scaleY;
        const positive = node.tone === "positive";
        const negative = node.tone === "danger";
        const lineColor = positive ? "16A34A" : negative ? "DC2626" : context.theme.accent;
        const fillColor = positive ? "DCFCE7" : negative ? "FEE2E2" : context.theme.surface;
        context.slide.addShape(context.pptx.ShapeType.roundRect, {
            x: nodeX,
            y: nodeY,
            w: nodeWidth,
            h: nodeHeight,
            rectRadius: 0.04,
            fill: { color: fillColor },
            line: { color: lineColor, pt: 1.25 },
            objectName: `Widget node ${index + 1}`,
        });
        context.slide.addText(
            [node.role.toUpperCase(), node.value, node.label, node.description]
                .filter(Boolean)
                .join("\n"),
            {
                x: nodeX + 0.12,
                y: nodeY + 0.06,
                w: Math.max(0.2, nodeWidth - 0.24),
                h: Math.max(0.2, nodeHeight - 0.12),
                fontFace: context.theme.bodyFont,
                fontSize: widthMode === "column" ? 10 : 12,
                bold: true,
                color: context.theme.text,
                valign: "middle",
                fit: "shrink",
                margin: 0,
                objectName: `Widget node ${index + 1} text`,
            },
        );
    });
    context.cursorY += height + 0.15;
};

const estimateBlockHeight = (block: SlideBlock, width: number) => {
    switch (block.type) {
        case "paragraph":
            return estimateTextHeight(block.text, width, 17) + 0.12;
        case "bullets":
            return Math.max(0.65, block.items.length * 0.42) + 0.12;
        case "table":
            return Math.max(0.9, (block.rows.length + 1) * 0.48) + 0.15;
        case "image":
        case "image-placeholder":
            return 2.82;
        case "quote":
            return estimateTextHeight(block.text, width, 22) + 0.55;
        case "callout":
            return estimateTextHeight(`${block.heading} ${block.text}`, width, 18) + 0.55;
        case "stats":
            return 1.6;
        case "widget":
            return width < 7 ? 4.55 : 4.05;
    }
};

const renderStructuredBlock = async (context: RenderContext, block: SlideBlock) => {
    if (isWidgetBlock(block)) {
        const treatment = block.treatment || "plain";
        if (treatment === "plain") {
            addStructuredWidget(context, block);
            return;
        }
        const startY = context.cursorY;
        const height = Math.min(
            context.region.y + context.region.h - startY,
            estimateBlockHeight(block, context.region.w),
        );
        context.slide.addShape(context.pptx.ShapeType.roundRect, {
            x: context.region.x,
            y: startY,
            w: context.region.w,
            h: height,
            rectRadius: 0.04,
            fill: {
                color: treatment === "outline" ? context.theme.background : context.theme.surface,
                transparency: treatment === "outline" ? 100 : 12,
            },
            line: {
                color: treatment === "accent" ? context.theme.accent : context.theme.muted,
                pt: treatment === "accent" ? 1.75 : 0.8,
            },
            objectName: `Block treatment ${treatment}`,
        });
        const widgetContext: RenderContext = {
            ...context,
            region: {
                x: context.region.x + 0.18,
                y: context.region.y,
                w: context.region.w - 0.36,
                h: context.region.h,
            },
            cursorY: startY + 0.18,
        };
        addStructuredWidget(widgetContext, block);
        context.cursorY = Math.max(widgetContext.cursorY + 0.18, startY + height + 0.12);
        return;
    }
    if (context.cursorY >= context.region.y + context.region.h) return;
    const treatment = block.treatment || "plain";
    const emphasis = block.emphasis || "standard";
    const padding = treatment === "plain" ? 0 : 0.18;
    const startY = context.cursorY;
    const availableHeight = context.region.y + context.region.h - startY;
    const decorationHeight = Math.min(
        availableHeight,
        estimateBlockHeight(block, context.region.w) + padding * 2,
    );
    if (treatment !== "plain") {
        const accent = treatment === "accent";
        context.slide.addShape(context.pptx.ShapeType.roundRect, {
            x: context.region.x,
            y: startY,
            w: context.region.w,
            h: decorationHeight,
            rectRadius: 0.04,
            fill: {
                color: treatment === "outline" ? context.theme.background : context.theme.surface,
                transparency: treatment === "outline" ? 100 : accent ? 5 : 18,
            },
            line: {
                color: accent ? context.theme.accent : context.theme.muted,
                transparency: treatment === "card" ? 65 : 20,
                pt: accent ? 1.75 : 0.8,
            },
            objectName: `Block treatment ${treatment}`,
        });
        if (accent) {
            context.slide.addShape(context.pptx.ShapeType.rect, {
                x: context.region.x,
                y: startY,
                w: 0.07,
                h: decorationHeight,
                line: { transparency: 100 },
                fill: { color: context.theme.accent },
                objectName: "Block accent edge",
            });
        }
    }
    const styledContext: RenderContext = {
        ...context,
        region: {
            x: context.region.x + padding,
            y: context.region.y,
            w: Math.max(0.2, context.region.w - padding * 2),
            h: context.region.h,
        },
        cursorY: startY + padding,
        fontScale:
            emphasis === "hero"
                ? 1.32
                : emphasis === "strong"
                  ? 1.1
                  : emphasis === "supporting"
                    ? 0.88
                    : 1,
    };
    switch (block.type) {
        case "paragraph":
            addParagraph(styledContext, block.text, {
                bold: emphasis === "hero" || emphasis === "strong",
                color: emphasis === "supporting" ? context.theme.muted : context.theme.text,
            });
            break;
        case "bullets":
            addStructuredList(styledContext, block);
            break;
        case "table":
            addStructuredTable(styledContext, block);
            break;
        case "image":
            await addStructuredImage(styledContext, block);
            break;
        case "image-placeholder":
            addStructuredImagePlaceholder(styledContext, block);
            break;
        case "quote":
            addStructuredEmphasis(styledContext, block.text, {
                quote: true,
                attribution: block.attribution,
            });
            break;
        case "callout":
            addStructuredEmphasis(styledContext, block.text, { heading: block.heading });
            break;
        case "stats":
            addStructuredStats(styledContext, block);
            break;
    }
    context.cursorY = Math.max(
        styledContext.cursorY + padding,
        treatment === "plain" ? styledContext.cursorY : startY + decorationHeight + 0.12,
    );
};

const renderStructuredRegion = async (
    slide: PptxGenJS.Slide,
    pptx: PptxGenJS,
    theme: PptxTheme,
    blocks: SlideBlock[],
    region: ContentRegion,
    options: { label?: string; fillMedia?: boolean } = {},
) => {
    let cursorY = region.y;
    if (options.label) {
        slide.addText(cleanText(options.label).toUpperCase(), {
            x: region.x,
            y: cursorY,
            w: region.w,
            h: 0.22,
            fontFace: theme.bodyFont,
            fontSize: 9,
            bold: true,
            charSpacing: 1.8,
            color: theme.muted,
            margin: 0,
            fit: "shrink",
            objectName: "Region label",
        });
        cursorY += 0.32;
    }
    const context: RenderContext = {
        slide,
        pptx,
        theme,
        region,
        cursorY,
        fillMedia: options.fillMedia,
    };
    for (const block of blocks) await renderStructuredBlock(context, block);
};

const renderStructuredSlide = async (
    pptx: PptxGenJS,
    slideData: ContentSlide,
    theme: PptxTheme,
    slideNumber: number,
) => {
    const slide = pptx.addSlide();
    const slideTheme = themeForTone(theme, slideData.tone || "default");
    slide.background = { color: slideTheme.background };
    if (slideData.backgroundImage) {
        await addBackgroundImage(slide, pptx, slideData.backgroundImage, slideTheme);
    }
    addPattern(slide, pptx, slideTheme, slideData.pattern || "none");
    addSlideFrame(slide, pptx, slideTheme, slideNumber);

    const blocksFor = (region: SlideRegion) =>
        slideData.blocks.filter((block) => block.region === region);
    const main = blocksFor("main");
    const primary = blocksFor("primary");
    const secondary = blocksFor("secondary");
    const media = blocksFor("media");
    const all = slideData.blocks;
    const hasAuthoredPair = primary.length > 0 && secondary.length > 0;
    const pairedPrimary = hasAuthoredPair ? primary : all.filter((_, index) => index % 2 === 0);
    const pairedSecondary = hasAuthoredPair ? secondary : all.filter((_, index) => index % 2 === 1);
    const visual = media.length
        ? media
        : main.filter((block) => block.type === "image" || block.type === "image-placeholder");
    const content = primary.length
        ? primary
        : main.filter((block) => block.type !== "image" && block.type !== "image-placeholder");
    const support = secondary.length
        ? secondary
        : all.filter((block) => !content.includes(block) && !visual.includes(block));
    const gap = slideData.density === "airy" ? 0.48 : slideData.density === "compact" ? 0.25 : 0.35;
    const margin =
        slideData.density === "airy" ? 0.78 : slideData.density === "compact" ? 0.48 : PAGE_MARGIN;
    const bottom = 6.88;
    const width = SLIDE_WIDTH - margin * 2;
    const regionOptions = (region: SlideRegion, fillMedia = false) => ({
        label: slideData.regionLabels?.[region],
        fillMedia,
    });
    const surface = (region: ContentRegion, name: string, accent = false) => {
        slide.addShape(pptx.ShapeType.rect, {
            ...region,
            fill: {
                color: accent ? slideTheme.surface : slideTheme.background,
                transparency: accent ? 8 : 0,
            },
            line: { color: slideTheme.muted, transparency: 62, pt: 0.8 },
            objectName: name,
        });
    };

    switch (slideData.layout) {
        case "cover": {
            const header: ContentRegion = { x: margin, y: 1.25, w: width - 1.2, h: 3.5 };
            addHeader(slide, slideTheme, slideData, header, { titleSize: 48 });
            const contentRegion: ContentRegion = {
                x: 8.75,
                y: 5.35,
                w: 3.85,
                h: 1.2,
            };
            slide.addShape(pptx.ShapeType.line, {
                x: contentRegion.x,
                y: contentRegion.y - 0.18,
                w: contentRegion.w,
                h: 0,
                line: { color: slideTheme.muted, transparency: 45, pt: 0.8 },
                objectName: "Cover divider",
            });
            await renderStructuredRegion(
                slide,
                pptx,
                slideTheme,
                main.length ? main : all,
                contentRegion,
                regionOptions("main"),
            );
            return;
        }
        case "section": {
            slide.addShape(pptx.ShapeType.rect, {
                x: 1.05,
                y: 1.45,
                w: 0.07,
                h: 4.4,
                line: { transparency: 100 },
                fill: { color: slideTheme.accent },
                objectName: "Section mark",
            });
            const headerBottom = addHeader(
                slide,
                slideTheme,
                slideData,
                { x: 1.45, y: 2.15, w: 8.8, h: 2.1 },
                { titleSize: 39 },
            );
            await renderStructuredRegion(
                slide,
                pptx,
                slideTheme,
                main.length ? main : all,
                { x: 1.45, y: headerBottom + 0.3, w: 7.2, h: bottom - headerBottom - 0.3 },
                regionOptions("main"),
            );
            return;
        }
        case "quote": {
            const leftWidth = 3.25;
            addHeader(
                slide,
                slideTheme,
                slideData,
                { x: margin, y: 2.15, w: leftWidth, h: 3 },
                { titleSize: 24 },
            );
            slide.addShape(pptx.ShapeType.line, {
                x: margin + leftWidth + 0.25,
                y: 1.15,
                w: 0,
                h: 5.2,
                line: { color: slideTheme.muted, transparency: 48, pt: 0.9 },
                objectName: "Quote divider",
            });
            await renderStructuredRegion(
                slide,
                pptx,
                slideTheme,
                main.length ? main : all,
                { x: margin + leftWidth + 0.75, y: 1.3, w: width - leftWidth - 0.75, h: 5.35 },
                regionOptions("main"),
            );
            return;
        }
        case "media-left":
        case "media-right": {
            const mediaWidth = width * 0.41;
            const textWidth = width - mediaWidth - gap;
            const mediaX = slideData.layout === "media-left" ? margin : margin + textWidth + gap;
            const textX = slideData.layout === "media-left" ? margin + mediaWidth + gap : margin;
            const mediaRegion: ContentRegion = { x: mediaX, y: 0.65, w: mediaWidth, h: 6.15 };
            surface(mediaRegion, "Media surface", true);
            await renderStructuredRegion(
                slide,
                pptx,
                slideTheme,
                visual,
                { x: mediaX + 0.08, y: 0.73, w: mediaWidth - 0.16, h: 5.99 },
                regionOptions("media", true),
            );
            const headerBottom = addHeader(
                slide,
                slideTheme,
                slideData,
                { x: textX, y: 0.7, w: textWidth, h: 2 },
                { titleSize: 27 },
            );
            const supportHeight = support.length ? 1.25 : 0;
            await renderStructuredRegion(
                slide,
                pptx,
                slideTheme,
                content,
                {
                    x: textX,
                    y: headerBottom + 0.28,
                    w: textWidth,
                    h: bottom - headerBottom - supportHeight - 0.4,
                },
                regionOptions("primary"),
            );
            if (support.length) {
                slide.addShape(pptx.ShapeType.line, {
                    x: textX,
                    y: bottom - supportHeight - 0.08,
                    w: textWidth,
                    h: 0,
                    line: { color: slideTheme.muted, transparency: 55, pt: 0.8 },
                    objectName: "Media support divider",
                });
                await renderStructuredRegion(
                    slide,
                    pptx,
                    slideTheme,
                    support,
                    { x: textX, y: bottom - supportHeight + 0.08, w: textWidth, h: supportHeight },
                    regionOptions("secondary"),
                );
            }
            return;
        }
    }

    const headerBottom = addHeader(
        slide,
        slideTheme,
        slideData,
        { x: margin, y: 0.55, w: width, h: 1.6 },
        { titleSize: 27 },
    );
    const top = Math.max(1.65, headerBottom + 0.28);
    const height = bottom - top;

    switch (slideData.layout) {
        case "split":
        case "comparison": {
            const primaryWidth =
                slideData.layout === "split" ? (width - gap) * 0.59 : (width - gap) / 2;
            const secondaryWidth = width - gap - primaryWidth;
            const primaryRegion = { x: margin, y: top, w: primaryWidth, h: height };
            const secondaryRegion = {
                x: margin + primaryWidth + gap,
                y: top + (slideData.layout === "comparison" ? 0.14 : 0),
                w: secondaryWidth,
                h: height - (slideData.layout === "comparison" ? 0.14 : 0),
            };
            if (slideData.layout === "comparison") {
                surface(primaryRegion, "Comparison primary surface", true);
                surface(secondaryRegion, "Comparison secondary surface", true);
                primaryRegion.x += 0.24;
                primaryRegion.y += 0.22;
                primaryRegion.w -= 0.48;
                primaryRegion.h -= 0.44;
                secondaryRegion.x += 0.24;
                secondaryRegion.y += 0.22;
                secondaryRegion.w -= 0.48;
                secondaryRegion.h -= 0.44;
            } else {
                slide.addShape(pptx.ShapeType.line, {
                    x: secondaryRegion.x - gap / 2,
                    y: top,
                    w: 0,
                    h: height,
                    line: { color: slideTheme.muted, transparency: 58, pt: 0.8 },
                    objectName: "Split divider",
                });
            }
            await renderStructuredRegion(
                slide,
                pptx,
                slideTheme,
                pairedPrimary,
                primaryRegion,
                regionOptions("primary"),
            );
            await renderStructuredRegion(
                slide,
                pptx,
                slideTheme,
                pairedSecondary,
                secondaryRegion,
                regionOptions("secondary"),
            );
            return;
        }
        case "sidebar": {
            const railWidth = width * 0.31;
            const primaryRegion = { x: margin, y: top, w: width - railWidth - gap, h: height };
            const railRegion = { x: margin + width - railWidth, y: top, w: railWidth, h: height };
            surface(railRegion, "Sidebar rail", true);
            await renderStructuredRegion(
                slide,
                pptx,
                slideTheme,
                primary.length ? primary : main,
                primaryRegion,
                regionOptions("primary"),
            );
            await renderStructuredRegion(
                slide,
                pptx,
                slideTheme,
                secondary,
                {
                    x: railRegion.x + 0.22,
                    y: railRegion.y + 0.22,
                    w: railRegion.w - 0.44,
                    h: railRegion.h - 0.44,
                },
                regionOptions("secondary"),
            );
            return;
        }
        case "spotlight": {
            const hero = all.find((block) => block.emphasis === "hero") || primary[0] || all[0];
            const heroBlocks = hero ? [hero] : [];
            const supportBlocks = all.filter((block) => block !== hero);
            const heroRegion = {
                x: margin + width * 0.31,
                y: top,
                w: width * 0.69,
                h: height - 1.35,
            };
            surface(heroRegion, "Spotlight hero surface", true);
            await renderStructuredRegion(
                slide,
                pptx,
                slideTheme,
                heroBlocks,
                {
                    x: heroRegion.x + 0.3,
                    y: heroRegion.y + 0.28,
                    w: heroRegion.w - 0.6,
                    h: heroRegion.h - 0.56,
                },
                regionOptions(hero?.region || "primary"),
            );
            const supportTop = bottom - 1.05;
            slide.addShape(pptx.ShapeType.line, {
                x: margin,
                y: supportTop - 0.18,
                w: width,
                h: 0,
                line: { color: slideTheme.muted, transparency: 50, pt: 0.8 },
                objectName: "Spotlight support divider",
            });
            const cellWidth = supportBlocks.length
                ? (width - gap * (supportBlocks.length - 1)) / supportBlocks.length
                : width;
            for (const [index, block] of supportBlocks.entries()) {
                await renderStructuredRegion(
                    slide,
                    pptx,
                    slideTheme,
                    [block],
                    { x: margin + index * (cellWidth + gap), y: supportTop, w: cellWidth, h: 1.05 },
                    index === 0 ? regionOptions("secondary") : {},
                );
            }
            return;
        }
        case "canvas": {
            const columns = 6;
            const cellGap = 0.16;
            const unit = (width - cellGap * (columns - 1)) / columns;
            const rows = Math.max(2, Math.ceil(all.length / 4) * 2);
            const rowHeight = (height - cellGap * (rows - 1)) / rows;
            const placements = [
                { column: 0, row: 0, columnSpan: 3, rowSpan: 2 },
                { column: 3, row: 0, columnSpan: 2, rowSpan: 1 },
                { column: 5, row: 0, columnSpan: 1, rowSpan: 1 },
                { column: 3, row: 1, columnSpan: 3, rowSpan: 1 },
            ];
            for (const [index, block] of all.entries()) {
                const placement = placements[index % placements.length];
                if (!placement) continue;
                const rowOffset = Math.floor(index / placements.length) * 2;
                const cell: ContentRegion = {
                    x: margin + placement.column * (unit + cellGap),
                    y: top + (rowOffset + placement.row) * (rowHeight + cellGap),
                    w: unit * placement.columnSpan + cellGap * (placement.columnSpan - 1),
                    h: rowHeight * placement.rowSpan + cellGap * (placement.rowSpan - 1),
                };
                surface(cell, `Canvas cell ${index + 1}`, true);
                await renderStructuredRegion(
                    slide,
                    pptx,
                    slideTheme,
                    [block],
                    { x: cell.x + 0.18, y: cell.y + 0.17, w: cell.w - 0.36, h: cell.h - 0.34 },
                    index === 0 ? regionOptions("main") : {},
                );
            }
            return;
        }
        case "body":
            await renderStructuredRegion(
                slide,
                pptx,
                slideTheme,
                main.length ? main : all,
                { x: margin, y: top, w: width, h: height },
                regionOptions("main"),
            );
            return;
    }
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
