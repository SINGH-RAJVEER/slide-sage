import PptxGenJS from "pptxgenjs";
import type {
    ChartConfig,
    ChartSlide,
    HtmlSlide,
    PresentationData,
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

const addList = (context: RenderContext, element: Element) => {
    const items = Array.from(element.children).filter((child) => child.tagName === "LI");
    if (items.length === 0) return;

    const ordered = element.tagName === "OL";
    const fontSize = items.length > 7 ? 14 : 17;
    const availableHeight = context.region.y + context.region.h - context.cursorY;
    const estimatedHeight = items.reduce(
        (height, item) =>
            height +
            Math.max(
                0.34,
                estimateTextHeight(cleanText(item.textContent), context.region.w, fontSize),
            ),
        0,
    );
    const height = Math.min(availableHeight, estimatedHeight + 0.15);
    const runs: PptxGenJS.TextProps[] = items.map((item, index) => ({
        text: cleanText(item.textContent),
        options: {
            bullet: ordered
                ? { type: "number", numberStartAt: index + 1, indent: 22 }
                : { type: "bullet", indent: 22 },
            breakLine: index < items.length - 1,
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
        breakLine: false,
        valign: "top",
        fit: "shrink",
        paraSpaceAfter: 10,
        objectName: ordered ? "Numbered list" : "Bullet list",
    });
    context.cursorY += height + 0.12;
};

const addTable = (context: RenderContext, element: HTMLTableElement) => {
    const sourceRows = Array.from(element.rows);
    if (sourceRows.length === 0) return;

    const columnCount = Math.max(...sourceRows.map((row) => row.cells.length), 1);
    const rows: PptxGenJS.TableRow[] = sourceRows.map((row, rowIndex) =>
        Array.from(row.cells).map((cell) => ({
            text: cleanText(cell.textContent),
            options: {
                bold: cell.tagName === "TH" || rowIndex === 0,
                color:
                    cell.tagName === "TH" || rowIndex === 0
                        ? context.theme.background
                        : context.theme.text,
                fill: {
                    color:
                        cell.tagName === "TH" || rowIndex === 0
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
    const fontSize = sourceRows.length > 8 || columnCount > 5 ? 11 : 14;

    context.slide.addTable(rows, {
        x: context.region.x,
        y: context.cursorY,
        w: context.region.w,
        h: height,
        colW: Array(columnCount).fill(context.region.w / columnCount),
        rowH: height / sourceRows.length,
        fontFace: context.theme.bodyFont,
        fontSize,
        color: context.theme.text,
        border: { type: "solid", color: context.theme.muted, pt: 0.5 },
        margin: 0.08,
        valign: "middle",
        autoPage: false,
        objectName: "Data table",
    });
    context.cursorY += height + 0.15;
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

const addImage = async (context: RenderContext, element: HTMLImageElement) => {
    const src = element.getAttribute("src");
    const alt = cleanText(element.getAttribute("alt")) || "Presentation image";
    if (!src) return;

    const availableHeight = context.region.y + context.region.h - context.cursorY;
    const height = Math.min(availableHeight, 2.7);
    if (height < 0.45) return;

    try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Image request failed with ${response.status}`);
        const data = await blobToDataUri(await response.blob());
        context.slide.addImage({
            data,
            x: context.region.x,
            y: context.cursorY,
            w: context.region.w,
            h: height,
            sizing: { type: "contain", w: context.region.w, h: height },
            altText: alt,
            objectName: alt,
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
        context.slide.addText(alt, {
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
};

const addEmphasis = (context: RenderContext, element: Element) => {
    const text = cleanText(element.textContent);
    if (!text) return;
    const isQuote = element.tagName === "BLOCKQUOTE" || element.id === "slide-quote";
    const availableHeight = context.region.y + context.region.h - context.cursorY;
    const height = Math.min(
        availableHeight,
        Math.max(0.9, estimateTextHeight(text, context.region.w - 0.5, isQuote ? 22 : 18) + 0.35),
    );

    context.slide.addShape(context.pptx.ShapeType.roundRect, {
        x: context.region.x,
        y: context.cursorY,
        w: context.region.w,
        h: height,
        rectRadius: 0.06,
        fill: { color: context.theme.surface },
        line: { color: context.theme.accent, pt: isQuote ? 2 : 1 },
        objectName: isQuote ? "Quote background" : "Highlight background",
    });
    context.slide.addText(text, {
        x: context.region.x + 0.28,
        y: context.cursorY + 0.12,
        w: context.region.w - 0.56,
        h: height - 0.24,
        fontFace: isQuote ? context.theme.headingFont : context.theme.bodyFont,
        fontSize: isQuote ? 22 : 18,
        bold: !isQuote,
        italic: isQuote,
        color: isQuote ? context.theme.title : context.theme.text,
        align: "center",
        valign: "middle",
        margin: 0,
        fit: "shrink",
        objectName: isQuote ? "Quote" : "Highlighted text",
    });
    context.cursorY += height + 0.15;
};

const isEmphasisElement = (element: Element) =>
    element.tagName === "BLOCKQUOTE" ||
    ["slide-quote", "slide-highlight", "slide-keypoint"].includes(element.id);

const renderElement = async (context: RenderContext, element: Element): Promise<void> => {
    if (context.cursorY >= context.region.y + context.region.h) return;
    if (["slide-title", "slide-footer", "slide-header"].includes(element.id)) return;

    if (element instanceof HTMLImageElement) {
        await addImage(context, element);
        return;
    }
    if (element instanceof HTMLTableElement) {
        addTable(context, element);
        return;
    }
    if (element.tagName === "UL" || element.tagName === "OL") {
        addList(context, element);
        return;
    }
    if (isEmphasisElement(element)) {
        addEmphasis(context, element);
        return;
    }
    if (element.id === "slide-stats") {
        const stats = Array.from(element.children);
        const count = Math.max(stats.length, 1);
        const gap = 0.15;
        const itemWidth = (context.region.w - gap * (count - 1)) / count;
        const height = Math.min(1.45, context.region.y + context.region.h - context.cursorY);
        stats.forEach((stat, index) => {
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
            context.slide.addText(cleanText(stat.textContent), {
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
        return;
    }

    const childElements = Array.from(element.children);
    const isTextElement = ["P", "H2", "H3", "H4", "H5", "SPAN"].includes(element.tagName);
    if (isTextElement || childElements.length === 0) {
        const text = cleanText(element.textContent);
        addParagraph(context, text, {
            bold: ["H2", "H3", "H4", "H5"].includes(element.tagName),
            color: element.id === "slide-subtitle" ? context.theme.muted : context.theme.text,
            fontSize: ["H2", "H3"].includes(element.tagName) ? 19 : 17,
        });
        return;
    }

    for (const child of childElements) {
        await renderElement(context, child);
    }
};

const renderColumn = async (
    slide: PptxGenJS.Slide,
    pptx: PptxGenJS,
    theme: PptxTheme,
    element: Element,
    region: ContentRegion,
) => {
    const context: RenderContext = { slide, pptx, theme, region, cursorY: region.y };
    for (const child of Array.from(element.children)) {
        await renderElement(context, child);
    }
};

const renderHtmlSlide = async (
    pptx: PptxGenJS,
    slideData: HtmlSlide,
    theme: PptxTheme,
    slideNumber: number,
) => {
    const slide = pptx.addSlide();
    addSlideFrame(slide, pptx, theme, slideNumber);

    const document = new DOMParser().parseFromString(slideData.html, "text/html");
    const root = document.querySelector("#slide-content") || document.body;
    const titleElement = root.querySelector("#slide-title");
    const directSubtitle = Array.from(root.children).find(
        (element) => element.id === "slide-subtitle",
    );
    const title = cleanText(titleElement?.textContent);
    const subtitle = cleanText(directSubtitle?.textContent);
    const centered =
        ["title", "quote", "conclusion"].includes(slideData.type) ||
        root.classList.contains("layout-title") ||
        root.classList.contains("layout-highlight");

    let contentY = centered ? 1.8 : 0.55;
    if (title) contentY = addTitle(slide, theme, title, centered, contentY);
    if (subtitle) contentY = addSubtitle(slide, theme, subtitle, centered, contentY + 0.1);

    if (centered && title && root.children.length <= 2) return;

    const twoColumn = root.querySelector(":scope > .two-column");
    if (twoColumn) {
        const columns = Array.from(twoColumn.children).filter((element) =>
            element.classList.contains("column"),
        );
        if (columns.length > 0) {
            const gap = 0.42;
            const availableWidth = SLIDE_WIDTH - PAGE_MARGIN * 2;
            const columnWidth = (availableWidth - gap * (columns.length - 1)) / columns.length;
            const top = Math.max(contentY + 0.25, 1.65);
            const height = 6.85 - top;

            for (const [index, column] of columns.entries()) {
                const region = {
                    x: PAGE_MARGIN + index * (columnWidth + gap),
                    y: top,
                    w: columnWidth,
                    h: height,
                };
                slide.addShape(pptx.ShapeType.roundRect, {
                    ...region,
                    rectRadius: 0.04,
                    fill: { color: theme.surface, transparency: 35 },
                    line: { color: theme.accent, transparency: 70, pt: 0.75 },
                    objectName: `Column ${index + 1} background`,
                });
                await renderColumn(slide, pptx, theme, column, {
                    x: region.x + 0.25,
                    y: region.y + 0.25,
                    w: region.w - 0.5,
                    h: region.h - 0.5,
                });
            }
            return;
        }
    }

    const region = {
        x: PAGE_MARGIN,
        y: Math.max(contentY + 0.22, centered ? 2.85 : 1.65),
        w: SLIDE_WIDTH - PAGE_MARGIN * 2,
        h: 6.85 - Math.max(contentY + 0.22, centered ? 2.85 : 1.65),
    };
    const context: RenderContext = { slide, pptx, theme, region, cursorY: region.y };
    for (const element of Array.from(root.children)) {
        if (element === titleElement || element === directSubtitle || element === twoColumn)
            continue;
        await renderElement(context, element);
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
        if (slide.type === "chart") {
            renderChartSlide(pptx, (slide as ChartSlide).chartConfig, theme, index + 1);
        } else {
            await renderHtmlSlide(pptx, slide as HtmlSlide, theme, index + 1);
        }
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
