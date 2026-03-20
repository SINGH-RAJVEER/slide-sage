import type React from "react";
import { useLayoutEffect, useRef } from "react";
import { AVAILABLE_TEMPLATES } from "@/modules/types/template";

interface TemplateApplierProps {
    templateId: string;
    children: React.ReactNode;
    className?: string;
    slideType?: string;
}

const TemplateApplier: React.FC<TemplateApplierProps> = ({
    templateId,
    children,
    className = "",
    slideType = "content",
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const template = AVAILABLE_TEMPLATES.find((t) => t.id === templateId);
        if (!template || !containerRef.current) return;

        const container = containerRef.current;
        const styles = template.styles;

        // Determine alignment based on slide type
        const isCenteredSlide = ["title", "quote", "conclusion"].includes(slideType);
        const contentJustify = isCenteredSlide ? "center" : "flex-start";
        // Apply styles to elements with specific IDs
        const applyStyles = (id: string, elementStyles: React.CSSProperties) => {
            const elements = container.querySelectorAll(`#${id}`);
            elements.forEach((element) => {
                const htmlElement = element as HTMLElement;
                Object.assign(htmlElement.style, elementStyles);
            });
        };

        // Apply styles to elements with specific classes
        const applyClassStyles = (className: string, elementStyles: React.CSSProperties) => {
            const elements = container.querySelectorAll(`.${className}`);
            elements.forEach((element) => {
                const htmlElement = element as HTMLElement;
                Object.assign(htmlElement.style, elementStyles);
            });
        };

        // Apply all template styles
        applyStyles("slide-content", {
            ...styles.slideContent,
            width: "100%",
            height: "100%",
            boxSizing: "border-box",
            justifyContent: contentJustify,
            ...(isCenteredSlide ? {} : { paddingTop: "4rem" }),
        });
        applyStyles("slide-title", styles.slideTitle);
        applyStyles("slide-subtitle", styles.slideSubtitle);

        // Helper for content blocks in non-centered slides
        const contentBlockStyle = isCenteredSlide
            ? {}
            : {
                  width: "90%",
                  maxWidth: "1400px",
                  textAlign: "left" as const,
                  alignSelf: "center",
                  marginTop: "auto",
                  marginBottom: "auto",
                  // Remove display: flex/column here as it breaks lists/tables
              };

        applyStyles("slide-list", {
            ...styles.slideList,
            ...contentBlockStyle,
            // Ensure lists look good
            paddingLeft: "2rem",
            paddingRight: "2rem",
            // Add some internal spacing for list items
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
        });
        applyStyles("slide-table", {
            ...styles.slideTable,
            ...contentBlockStyle,
            // Ensure tables are centered
            marginLeft: "auto",
            marginRight: "auto",
        });
        applyStyles("slide-quote", styles.slideQuote);
        applyStyles("slide-description", {
            ...styles.slideDescription,
            ...contentBlockStyle,
            display: "block",
            textAlign: "center", // Descriptions usually look better centered
        });
        applyStyles("slide-highlight", {
            ...styles.slideHighlight,
            ...(isCenteredSlide
                ? {}
                : {
                      width: "90%",
                      maxWidth: "1400px",
                      marginTop: "auto",
                      marginBottom: "auto",
                      alignSelf: "center",
                  }),
        });
        applyStyles("slide-stats", {
            ...styles.slideStats,
            ...(isCenteredSlide
                ? {}
                : {
                      width: "95%",
                      maxWidth: "1600px",
                      marginTop: "auto",
                      marginBottom: "auto",
                      alignSelf: "center",
                  }),
        });
        applyStyles("slide-keypoint", styles.slideKeypoint);
        applyStyles("slide-image", styles.slideImage);

        // Apply layout styles
        applyClassStyles("two-column", {
            ...styles.twoColumn,
            ...(isCenteredSlide
                ? {}
                : {
                      width: "95%",
                      maxWidth: "1600px",
                      marginTop: "auto",
                      marginBottom: "auto",
                      alignSelf: "center",
                  }),
        });
        applyClassStyles("column", styles.column);

        // Apply table-specific styles
        const tables = container.querySelectorAll("#slide-table");
        tables.forEach((table) => {
            const ths = table.querySelectorAll("th");
            const tds = table.querySelectorAll("td");

            ths.forEach((th) => {
                Object.assign((th as HTMLElement).style, styles.slideTableTh);
            });

            tds.forEach((td) => {
                Object.assign((td as HTMLElement).style, styles.slideTableTd);
            });
        });

        // Apply list item styles
        const listItems = container.querySelectorAll("#slide-list li");
        listItems.forEach((li) => {
            const htmlLi = li as HTMLElement;
            htmlLi.style.marginBottom = "0.5rem"; // Add spacing between list items
        });
    }, [templateId, slideType]);

    const template = AVAILABLE_TEMPLATES.find((t) => t.id === templateId);

    return (
        <div
            ref={containerRef}
            className={`w-full h-full ${template?.backgroundClass || ""} ${className}`}
        >
            {children}
        </div>
    );
};

export default TemplateApplier;
