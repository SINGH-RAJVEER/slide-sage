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
        const container = containerRef.current;
        const template = AVAILABLE_TEMPLATES.find((t) => t.id === templateId);
        if (!template || !container) return;

        const styles = template.styles;

        // Determine alignment based on slide type
        const isCenteredSlide = ["title", "quote", "conclusion"].includes(slideType);
        const contentJustify = isCenteredSlide ? "center" : "flex-start";

        // The full styling pass. Re-runnable and idempotent so it can fire on the initial
        // mount, on template/type changes, and whenever streamed HTML is replaced with the
        // final parsed HTML (handled by the MutationObserver below). This guarantees no slide
        // is ever left unstyled regardless of when its DOM content settles.
        const applyAll = () => {
            // Apply styles to elements with specific IDs (querySelectorAll handles the case
            // where the AI emits duplicate IDs, e.g. multiple #slide-list in a two-column).
            const applyStyles = (id: string, elementStyles: React.CSSProperties) => {
                container.querySelectorAll(`#${id}`).forEach((element) => {
                    Object.assign((element as HTMLElement).style, elementStyles);
                });
            };

            const applyClassStyles = (cls: string, elementStyles: React.CSSProperties) => {
                container.querySelectorAll(`.${cls}`).forEach((element) => {
                    Object.assign((element as HTMLElement).style, elementStyles);
                });
            };

            // Base theme styling applied to the wrapper container itself. This is the safety
            // net: even if the AI omits the #slide-content wrapper or the standardized IDs,
            // every slide still inherits the theme background, text color and font.
            Object.assign(container.style, {
                background: styles.slideContent.background,
                color: styles.slideContent.color,
                fontFamily: styles.slideContent.fontFamily,
                boxSizing: "border-box",
            });

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
                  };

            applyStyles("slide-list", {
                ...styles.slideList,
                ...contentBlockStyle,
                paddingLeft: "2rem",
                paddingRight: "2rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
            });
            applyStyles("slide-table", {
                ...styles.slideTable,
                ...contentBlockStyle,
                marginLeft: "auto",
                marginRight: "auto",
            });
            applyStyles("slide-quote", styles.slideQuote);
            applyStyles("slide-description", {
                ...styles.slideDescription,
                ...contentBlockStyle,
                display: "block",
                textAlign: "center",
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

            // Layout styles
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

            // Table cell styles
            container.querySelectorAll("#slide-table").forEach((table) => {
                table.querySelectorAll("th").forEach((th) => {
                    Object.assign((th as HTMLElement).style, styles.slideTableTh);
                });
                table.querySelectorAll("td").forEach((td) => {
                    Object.assign((td as HTMLElement).style, styles.slideTableTd);
                });
            });

            // List item spacing
            container.querySelectorAll("#slide-list li").forEach((li) => {
                (li as HTMLElement).style.marginBottom = "0.5rem";
            });
        };

        applyAll();

        // Re-apply whenever the injected HTML subtree changes. During generation a slide is
        // first rendered from the streamed (partial) HTML and later replaced with the final
        // parsed HTML; that replacement is a childList mutation, not a template/type change,
        // so the dependency array alone would miss it and leave the slide unstyled. We watch
        // childList/subtree only (NOT attributes) so our own inline-style writes don't
        // retrigger the observer and cause an infinite loop.
        const observer = new MutationObserver(() => applyAll());
        observer.observe(container, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, [templateId, slideType]);

    const template = AVAILABLE_TEMPLATES.find((t) => t.id === templateId);

    return (
        <div
            data-pdf-slide
            ref={containerRef}
            className={`template-applier w-full h-full ${template?.backgroundClass || ""} ${className}`}
        >
            {children}
        </div>
    );
};

export default TemplateApplier;
