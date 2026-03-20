import React from "react";
import ChartRenderer from "@/components/Charts/ChartRenderer";
import TemplateApplier from "@/components/Viewer/TemplateApplier";
import type { ChartSlide, HtmlSlide, Slide } from "@/modules/types/presentation";
import { AVAILABLE_TEMPLATES } from "@/modules/types/template";

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
        const template = AVAILABLE_TEMPLATES.find((t) => t.id === currentTemplate);
        const textColor = template?.styles.slideContent.color || "white";

        if (slide.type === "chart") {
            const chartSlide = slide as ChartSlide;
            return (
                <TemplateApplier
                    templateId={currentTemplate}
                    className="w-full h-full"
                    slideType="chart"
                >
                    <div
                        id="slide-content"
                        className="w-full h-full flex items-center justify-center"
                    >
                        <ChartRenderer
                            chartConfig={chartSlide.chartConfig}
                            className="w-full h-full"
                            textColor={textColor}
                            isActive={isActive}
                        />
                    </div>
                </TemplateApplier>
            );
        }

        const htmlSlide = slide as HtmlSlide;
        return (
            <TemplateApplier
                templateId={currentTemplate}
                className="w-full h-full"
                slideType={htmlSlide.type}
            >
                <div
                    className="w-full h-full flex flex-col justify-center"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: Rendering user content from html slide
                    dangerouslySetInnerHTML={{
                        __html: htmlSlide.html,
                    }}
                />
            </TemplateApplier>
        );
    },
    (prevProps, nextProps) => {
        if (prevProps.currentTemplate !== nextProps.currentTemplate) return false;
        if (prevProps.slide !== nextProps.slide) return false;
        if (prevProps.slide.type === "chart") {
            return prevProps.isActive === nextProps.isActive;
        }
        return true;
    },
);
