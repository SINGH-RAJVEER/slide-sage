import type { Slide } from "@slide-sage/types";
import { JSONRecoveryError, recoverJson } from "../../utils/json-recovery";

interface RawSlide extends Record<string, unknown> {
    id?: unknown;
    type?: unknown;
    html?: unknown;
    chartConfig?: unknown;
}

export interface RawPresentation extends Record<string, unknown> {
    slides?: unknown;
    title?: unknown;
}

export function processSlide(input: unknown, index: number): Slide | null {
    if (!input || typeof input !== "object") {
        console.warn(`Invalid slide ${index}, skipping`);
        return null;
    }

    const slide = input as RawSlide;
    const id = typeof slide.id === "string" && slide.id ? slide.id : `slide-${index + 1}`;
    const type = typeof slide.type === "string" && slide.type ? slide.type : "content";

    if (type === "chart") {
        const chartConfig = slide.chartConfig;
        if (
            chartConfig &&
            typeof chartConfig === "object" &&
            "data" in chartConfig &&
            chartConfig.data &&
            typeof chartConfig.data === "object"
        ) {
            return { ...slide, id, type, chartConfig } as Slide;
        }

        console.warn(`Chart slide ${index} missing chartConfig, converting to content`);
        return {
            ...slide,
            id,
            type: "content",
            html: '<div id="slide-content"><h2 id="slide-title">Data Visualization</h2><p id="slide-description">Chart data unavailable</p></div>',
        } as Slide;
    }

    if (typeof slide.html !== "string" || !slide.html.trim()) {
        console.warn(`Slide ${index} has no renderable content, skipping`);
        return null;
    }

    const htmlContent = slide.html.trim();
    const hasWrapper = /^<div\b[^>]*\bid=["']slide-content["']/i.test(htmlContent);
    const html = hasWrapper ? htmlContent : `<div id="slide-content">${htmlContent}</div>`;
    return { ...slide, id, type, html } as Slide;
}

export function parsePresentationContent(content: string): RawPresentation {
    try {
        return JSON.parse(content) as RawPresentation;
    } catch (jsonError) {
        console.warn("Initial JSON parse failed, attempting recovery...");
        const recoveryResult = recoverJson(content, jsonError as Error);
        if (!recoveryResult.content || typeof recoveryResult.content !== "object") {
            throw new JSONRecoveryError("Recovered response was not a JSON object");
        }
        console.log(`JSON recovery successful using ${recoveryResult.strategy} strategy`);
        return recoveryResult.content as RawPresentation;
    }
}

export function normalizePresentationSlides(
    presentation: RawPresentation,
    expectedSlideCount?: number
): Slide[] {
    const rawSlides = Array.isArray(presentation.slides) ? presentation.slides : [];
    let slides = rawSlides
        .map((slide, index) => processSlide(slide, index))
        .filter((slide): slide is Slide => slide !== null);

    if (slides.length === 0) {
        throw new Error("OpenRouter returned no usable slides");
    }
    if (expectedSlideCount !== undefined && slides.length < expectedSlideCount) {
        throw new Error(
            `OpenRouter returned ${slides.length} of ${expectedSlideCount} requested slides`
        );
    }
    if (expectedSlideCount !== undefined && slides.length > expectedSlideCount) {
        console.warn(
            `OpenRouter returned ${slides.length} slides; keeping the requested ${expectedSlideCount}`
        );
        slides = slides.slice(0, expectedSlideCount);
    }

    const usedIds = new Set<string>();
    for (const [index, slide] of slides.entries()) {
        const candidate = String(slide.id || "").trim();
        const id = candidate && !usedIds.has(candidate) ? candidate : `slide-${index + 1}`;
        slide.id = id;
        usedIds.add(id);
    }

    return slides;
}
