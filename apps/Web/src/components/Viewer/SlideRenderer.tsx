import { Image as ImageIcon } from "lucide-react";
import React from "react";
import ChartRenderer from "@/components/Charts/ChartRenderer";
import TemplateApplier from "@/components/Viewer/TemplateApplier";
import { adaptLegacyHtmlSlide } from "@/lib/legacy-slide-adapter";
import { tweenNumber } from "@/lib/presentation-motion";
import {
    type ContentSlide,
    isChartSlide,
    isLegacyHtmlSlide,
    type Slide,
    type SlideBlock,
} from "@/modules/types/presentation";
import { AVAILABLE_TEMPLATES, type TemplateStyles } from "@/modules/types/template";

function keyed<T>(items: T[], keyFor: (item: T) => string): Array<{ item: T; key: string }> {
    const occurrences = new Map<string, number>();
    return items.map((item) => {
        const base = keyFor(item);
        const occurrence = occurrences.get(base) || 0;
        occurrences.set(base, occurrence + 1);
        return { item, key: occurrence === 0 ? base : `${base}-${occurrence}` };
    });
}

function AnimatedStatValue({ value, active }: { value: string; active: boolean }) {
    const [display, setDisplay] = React.useState(value);
    React.useEffect(() => {
        const match = value.match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
        if (!active || !match) {
            setDisplay(value);
            return;
        }
        const target = Number(match[2]?.replaceAll(",", ""));
        if (!Number.isFinite(target)) {
            setDisplay(value);
            return;
        }
        const decimals = match[2]?.split(".")[1]?.length || 0;
        return tweenNumber({
            from: 0,
            to: target,
            durationMs: 700,
            onUpdate: (current) => {
                const formatted = current.toLocaleString(undefined, {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals,
                });
                setDisplay(`${match[1] || ""}${formatted}${match[3] || ""}`);
            },
        });
    }, [active, value]);
    return display;
}

function BlockRenderer({
    block,
    styles,
    isActive,
    editing,
    onEdit,
}: {
    block: SlideBlock;
    styles: TemplateStyles;
    isActive: boolean;
    editing?: boolean;
    onEdit?: (block: SlideBlock) => void;
}) {
    const textArea = (value: string, update: (value: string) => SlideBlock, rows = 3) =>
        editing ? (
            <textarea
                value={value}
                rows={rows}
                onChange={(event) => onEdit?.(update(event.target.value))}
                className="ss-inplace-text"
            />
        ) : null;
    switch (block.type) {
        case "paragraph":
            if (editing) return textArea(block.text, (text) => ({ ...block, text }));
            return <p style={{ ...styles.slideDescription, textAlign: "left" }}>{block.text}</p>;
        case "bullets": {
            if (editing) {
                return textArea(
                    block.items.join("\n"),
                    (value) => ({ ...block, items: value.split("\n").slice(0, 8) }),
                    Math.max(3, block.items.length),
                );
            }
            const List = block.ordered ? "ol" : "ul";
            return (
                <List style={{ ...styles.slideList, margin: 0, width: "100%" }}>
                    {keyed(block.items, (item) => item).map(({ item, key }) => (
                        <li key={key} style={{ marginBottom: "0.5rem" }}>
                            {item}
                        </li>
                    ))}
                </List>
            );
        }
        case "table":
            if (editing) {
                return textArea(
                    [block.headers.join(" | "), ...block.rows.map((row) => row.join(" | "))].join(
                        "\n",
                    ),
                    (value) => {
                        const lines = value.split("\n").slice(0, 9);
                        const headers = (lines.shift() || "")
                            .split("|")
                            .map((item) => item.trim())
                            .slice(0, 6);
                        return {
                            ...block,
                            headers,
                            rows: lines.map((line) =>
                                headers.map((_, index) => line.split("|")[index]?.trim() || ""),
                            ),
                        };
                    },
                    Math.max(4, block.rows.length + 1),
                );
            }
            return (
                <div style={{ width: "100%", overflow: "hidden" }}>
                    <table style={{ ...styles.slideTable, width: "100%", margin: 0 }}>
                        <thead>
                            <tr>
                                {block.headers.map((header) => (
                                    <th key={header} style={styles.slideTableTh}>
                                        {header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {keyed(block.rows, (row) => JSON.stringify(row)).map(
                                ({ item: row, key: rowKey }) => (
                                    <tr key={rowKey}>
                                        {keyed(block.headers, (header) => header).map(
                                            ({ key: headerKey }, cellIndex) => (
                                                <td key={headerKey} style={styles.slideTableTd}>
                                                    {row[cellIndex] || ""}
                                                </td>
                                            ),
                                        )}
                                    </tr>
                                ),
                            )}
                        </tbody>
                    </table>
                </div>
            );
        case "image":
            return (
                <figure style={{ margin: 0, width: "100%", textAlign: "center" }}>
                    <img
                        src={block.url}
                        alt={block.alt}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        style={{ ...styles.slideImage, maxHeight: "22rem", margin: "0 auto" }}
                    />
                    {block.caption && (
                        <figcaption style={styles.slideDescription}>{block.caption}</figcaption>
                    )}
                </figure>
            );
        case "image-placeholder":
            return (
                <figure
                    role="img"
                    aria-label={block.alt}
                    style={{
                        width: "100%",
                        minHeight: "12rem",
                        aspectRatio: "16 / 9",
                        margin: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.75rem",
                        padding: "1.5rem",
                        border: "1px dashed currentColor",
                        borderRadius: "6px",
                        background: styles.slideKeypoint.background,
                        color: styles.slideDescription.color,
                        textAlign: "center",
                        boxSizing: "border-box",
                    }}
                >
                    <ImageIcon aria-hidden="true" style={{ width: "2rem", height: "2rem" }} />
                    <strong style={{ color: "inherit", fontSize: "1rem" }}>{block.alt}</strong>
                    {block.caption && (
                        <figcaption style={{ ...styles.slideDescription, margin: 0 }}>
                            {block.caption}
                        </figcaption>
                    )}
                </figure>
            );
        case "quote":
            if (editing) return textArea(block.text, (text) => ({ ...block, text }), 4);
            return (
                <div style={{ width: "100%", textAlign: "center" }}>
                    <blockquote style={{ ...styles.slideQuote, margin: "1rem 0" }}>
                        {block.text}
                    </blockquote>
                    {block.attribution && (
                        <p style={styles.slideDescription}>{block.attribution}</p>
                    )}
                </div>
            );
        case "callout":
            if (editing) return textArea(block.text, (text) => ({ ...block, text }), 3);
            return (
                <div style={{ ...styles.slideHighlight, margin: 0, width: "100%" }}>
                    {block.heading && <strong>{block.heading}</strong>}
                    <p style={{ margin: block.heading ? "0.5rem 0 0" : 0 }}>{block.text}</p>
                </div>
            );
        case "stats":
            if (editing) {
                return (
                    <div style={{ ...styles.slideStats, margin: 0 }}>
                        {block.items.map((item, index) => (
                            <div key={`${item.value}-${item.label}`} style={styles.slideKeypoint}>
                                <input
                                    className="ss-inplace-input text-center text-2xl font-bold"
                                    value={item.value}
                                    onChange={(event) =>
                                        onEdit?.({
                                            ...block,
                                            items: block.items.map((entry, itemIndex) =>
                                                itemIndex === index
                                                    ? { ...entry, value: event.target.value }
                                                    : entry,
                                            ),
                                        })
                                    }
                                />
                                <input
                                    className="ss-inplace-input text-center"
                                    value={item.label}
                                    onChange={(event) =>
                                        onEdit?.({
                                            ...block,
                                            items: block.items.map((entry, itemIndex) =>
                                                itemIndex === index
                                                    ? { ...entry, label: event.target.value }
                                                    : entry,
                                            ),
                                        })
                                    }
                                />
                            </div>
                        ))}
                    </div>
                );
            }
            return (
                <div style={{ ...styles.slideStats, margin: 0 }}>
                    {keyed(block.items, (item) => `${item.value}-${item.label}`).map(
                        ({ item, key }) => (
                            <div key={key} style={styles.slideKeypoint}>
                                <strong style={{ display: "block", fontSize: "2rem" }}>
                                    <AnimatedStatValue value={item.value} active={isActive} />
                                </strong>
                                <span>{item.label}</span>
                            </div>
                        ),
                    )}
                </div>
            );
    }
}

function Region({
    blocks,
    styles,
    isActive,
    onSelectBlock,
    onEditBlock,
    editingTarget,
}: {
    blocks: SlideBlock[];
    styles: TemplateStyles;
    isActive: boolean;
    onSelectBlock?: (block: SlideBlock, element: HTMLElement) => void;
    onEditBlock?: (block: SlideBlock) => void;
    editingTarget?: string;
}) {
    return (
        <div
            style={{
                ...styles.column,
                width: "100%",
                minWidth: 0,
                justifyContent: "center",
            }}
        >
            {keyed(blocks, (block) => block.id || JSON.stringify(block)).map(({ item, key }) => (
                <button
                    type="button"
                    key={key}
                    data-edit-block-id={item.id}
                    onClick={(event) => {
                        if (!onSelectBlock) return;
                        event.stopPropagation();
                        onSelectBlock(item, event.currentTarget);
                    }}
                    className={
                        onSelectBlock ? "ss-editable-object ss-editable-reset" : "ss-editable-reset"
                    }
                >
                    <BlockRenderer
                        block={item}
                        styles={styles}
                        isActive={isActive}
                        editing={editingTarget === item.id}
                        onEdit={onEditBlock}
                    />
                </button>
            ))}
        </div>
    );
}

function StructuredContent({
    slide,
    styles,
    isActive,
    onSelectBlock,
    onSelectTitle,
    onSelectSubtitle,
    onEditTitle,
    onEditSubtitle,
    onEditBlock,
    editingTarget,
}: {
    slide: ContentSlide;
    styles: TemplateStyles;
    isActive: boolean;
    onSelectBlock?: (block: SlideBlock, element: HTMLElement) => void;
    onSelectTitle?: () => void;
    onSelectSubtitle?: () => void;
    onEditTitle?: (title: string) => void;
    onEditSubtitle?: (subtitle: string) => void;
    onEditBlock?: (block: SlideBlock) => void;
    editingTarget?: string;
}) {
    const centered = slide.layout === "title" || slide.layout === "quote";
    const mainBlocks = slide.blocks.filter((block) => block.region === "main");
    const leftBlocks = slide.blocks.filter((block) => block.region === "left");
    const rightBlocks = slide.blocks.filter((block) => block.region === "right");
    const showColumns = slide.layout === "two-column" || slide.layout === "image-right";

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: centered ? "center" : "flex-start",
                alignItems: "center",
                gap: "1rem",
                minHeight: 0,
            }}
        >
            <header style={{ width: "100%", textAlign: centered ? "center" : "left" }}>
                {editingTarget === "title" ? (
                    <input
                        value={slide.title}
                        onChange={(event) => onEditTitle?.(event.target.value)}
                        className="ss-inplace-input w-full"
                        style={{
                            ...styles.slideTitle,
                            marginTop: 0,
                            marginBottom: slide.subtitle ? "0.75rem" : "1.25rem",
                            textAlign: centered ? "center" : "left",
                        }}
                    />
                ) : (
                    <h1
                        role={onSelectTitle ? "button" : undefined}
                        tabIndex={onSelectTitle ? 0 : undefined}
                        onKeyDown={(event) => {
                            if (onSelectTitle && (event.key === "Enter" || event.key === " "))
                                onSelectTitle();
                        }}
                        onClick={(event) => {
                            if (!onSelectTitle) return;
                            event.stopPropagation();
                            onSelectTitle();
                        }}
                        className={onSelectTitle ? "ss-editable-object" : undefined}
                        style={{
                            ...styles.slideTitle,
                            marginTop: 0,
                            marginBottom: slide.subtitle ? "0.75rem" : "1.25rem",
                            textAlign: centered ? "center" : "left",
                        }}
                    >
                        {slide.title}
                    </h1>
                )}
                {editingTarget === "subtitle" ? (
                    <input
                        value={slide.subtitle}
                        onChange={(event) => onEditSubtitle?.(event.target.value)}
                        className="ss-inplace-input w-full"
                        style={styles.slideSubtitle}
                        placeholder="Add subtitle"
                    />
                ) : (
                    slide.subtitle && (
                        <p
                            role={onSelectSubtitle ? "button" : undefined}
                            tabIndex={onSelectSubtitle ? 0 : undefined}
                            onKeyDown={(event) => {
                                if (
                                    onSelectSubtitle &&
                                    (event.key === "Enter" || event.key === " ")
                                )
                                    onSelectSubtitle();
                            }}
                            onClick={(event) => {
                                if (!onSelectSubtitle) return;
                                event.stopPropagation();
                                onSelectSubtitle();
                            }}
                            className={onSelectSubtitle ? "ss-editable-object" : undefined}
                            style={styles.slideSubtitle}
                        >
                            {slide.subtitle}
                        </p>
                    )
                )}
            </header>

            {showColumns ? (
                <div
                    style={{
                        ...styles.twoColumn,
                        width: "100%",
                        flex: 1,
                        minHeight: 0,
                        alignItems: "stretch",
                    }}
                >
                    <Region
                        blocks={slide.layout === "image-right" ? mainBlocks : leftBlocks}
                        styles={styles}
                        isActive={isActive}
                        onSelectBlock={onSelectBlock}
                        onEditBlock={onEditBlock}
                        editingTarget={editingTarget}
                    />
                    <Region
                        blocks={rightBlocks}
                        styles={styles}
                        isActive={isActive}
                        onSelectBlock={onSelectBlock}
                        onEditBlock={onEditBlock}
                        editingTarget={editingTarget}
                    />
                </div>
            ) : (
                <div
                    style={{
                        width: "100%",
                        flex: centered ? undefined : 1,
                        minHeight: 0,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        gap: "1rem",
                    }}
                >
                    <Region
                        blocks={mainBlocks}
                        styles={styles}
                        isActive={isActive}
                        onSelectBlock={onSelectBlock}
                        onEditBlock={onEditBlock}
                        editingTarget={editingTarget}
                    />
                </div>
            )}
        </div>
    );
}

export const SlideRenderer = React.memo(
    ({
        slide,
        currentTemplate,
        isActive,
        onSelectBlock,
        onSelectTitle,
        onSelectSubtitle,
        onEditTitle,
        onEditSubtitle,
        onEditBlock,
        editingTarget,
    }: {
        slide: Slide;
        currentTemplate: string;
        isActive: boolean;
        onSelectBlock?: (block: SlideBlock, element: HTMLElement) => void;
        onSelectTitle?: () => void;
        onSelectSubtitle?: () => void;
        onEditTitle?: (title: string) => void;
        onEditSubtitle?: (subtitle: string) => void;
        onEditBlock?: (block: SlideBlock) => void;
        editingTarget?: string;
    }) => {
        const template =
            AVAILABLE_TEMPLATES.find((item) => item.id === currentTemplate) ||
            AVAILABLE_TEMPLATES.find((item) => item.id === "corporate-blue");
        if (!template) return null;

        if (isChartSlide(slide)) {
            return (
                <TemplateApplier templateId={currentTemplate} className="w-full h-full">
                    <div className="w-full h-full flex items-center justify-center">
                        <ChartRenderer
                            chartConfig={slide.chartConfig}
                            className="w-full h-full"
                            textColor={String(template.styles.slideContent.color || "white")}
                            isActive={isActive}
                        />
                    </div>
                </TemplateApplier>
            );
        }

        const contentSlide = isLegacyHtmlSlide(slide) ? adaptLegacyHtmlSlide(slide) : slide;
        return (
            <TemplateApplier templateId={currentTemplate} className="w-full h-full">
                <StructuredContent
                    slide={contentSlide}
                    styles={template.styles}
                    isActive={isActive}
                    onSelectBlock={onSelectBlock}
                    onSelectTitle={onSelectTitle}
                    onSelectSubtitle={onSelectSubtitle}
                    onEditTitle={onEditTitle}
                    onEditSubtitle={onEditSubtitle}
                    onEditBlock={onEditBlock}
                    editingTarget={editingTarget}
                />
            </TemplateApplier>
        );
    },
    (previous, next) =>
        previous.currentTemplate === next.currentTemplate &&
        previous.slide === next.slide &&
        previous.isActive === next.isActive &&
        previous.onSelectBlock === next.onSelectBlock &&
        previous.onSelectTitle === next.onSelectTitle &&
        previous.onSelectSubtitle === next.onSelectSubtitle &&
        previous.onEditTitle === next.onEditTitle &&
        previous.onEditSubtitle === next.onEditSubtitle &&
        previous.onEditBlock === next.onEditBlock &&
        previous.editingTarget === next.editingTarget,
);
