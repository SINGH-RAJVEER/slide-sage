import { Image as ImageIcon } from "lucide-react";
import React from "react";
import ChartRenderer from "@/components/Charts/ChartRenderer";
import TemplateApplier from "@/components/Viewer/TemplateApplier";
import { adaptLegacyHtmlSlide } from "@/lib/legacy-slide-adapter";
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

function BlockRenderer({ block, styles }: { block: SlideBlock; styles: TemplateStyles }) {
    switch (block.type) {
        case "paragraph":
            return <p style={{ ...styles.slideDescription, textAlign: "left" }}>{block.text}</p>;
        case "bullets": {
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
            return (
                <div style={{ ...styles.slideHighlight, margin: 0, width: "100%" }}>
                    {block.heading && <strong>{block.heading}</strong>}
                    <p style={{ margin: block.heading ? "0.5rem 0 0" : 0 }}>{block.text}</p>
                </div>
            );
        case "stats":
            return (
                <div style={{ ...styles.slideStats, margin: 0 }}>
                    {keyed(block.items, (item) => `${item.value}-${item.label}`).map(
                        ({ item, key }) => (
                            <div key={key} style={styles.slideKeypoint}>
                                <strong style={{ display: "block", fontSize: "2rem" }}>
                                    {item.value}
                                </strong>
                                <span>{item.label}</span>
                            </div>
                        ),
                    )}
                </div>
            );
    }
}

function Region({ blocks, styles }: { blocks: SlideBlock[]; styles: TemplateStyles }) {
    return (
        <div
            style={{
                ...styles.column,
                width: "100%",
                minWidth: 0,
                justifyContent: "center",
            }}
        >
            {keyed(blocks, (block) => JSON.stringify(block)).map(({ item, key }) => (
                <BlockRenderer key={key} block={item} styles={styles} />
            ))}
        </div>
    );
}

function StructuredContent({ slide, styles }: { slide: ContentSlide; styles: TemplateStyles }) {
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
                <h1
                    style={{
                        ...styles.slideTitle,
                        marginTop: 0,
                        marginBottom: slide.subtitle ? "0.75rem" : "1.25rem",
                        textAlign: centered ? "center" : "left",
                    }}
                >
                    {slide.title}
                </h1>
                {slide.subtitle && <p style={styles.slideSubtitle}>{slide.subtitle}</p>}
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
                    />
                    <Region blocks={rightBlocks} styles={styles} />
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
                    <Region blocks={mainBlocks} styles={styles} />
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
    }: {
        slide: Slide;
        currentTemplate: string;
        isActive: boolean;
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
                <StructuredContent slide={contentSlide} styles={template.styles} />
            </TemplateApplier>
        );
    },
    (previous, next) =>
        previous.currentTemplate === next.currentTemplate &&
        previous.slide === next.slide &&
        (isChartSlide(previous.slide) ? previous.isActive === next.isActive : true),
);
