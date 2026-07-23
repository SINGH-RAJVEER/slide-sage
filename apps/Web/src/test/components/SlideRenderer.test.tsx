/// <reference lib="dom" />

import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { SlideRenderer } from "@/components/Viewer/SlideRenderer";
import type { Slide } from "@/modules/types/presentation";

function renderSlide(slide: Slide) {
    return render(<SlideRenderer slide={slide} currentTemplate="corporate-blue" isActive={true} />);
}

describe("SlideRenderer", () => {
    it("renders structured model strings as text rather than executable markup", () => {
        const { container, getByText } = renderSlide({
            id: "safe-content",
            type: "content",
            layout: "content",
            title: "Security review",
            subtitle: "",
            blocks: [
                {
                    type: "paragraph",
                    region: "main",
                    text: '<img src=x onerror="globalThis.compromised=true">',
                },
            ],
        });

        expect(getByText('<img src=x onerror="globalThis.compromised=true">')).toBeInTheDocument();
        expect(container.querySelector("img")).toBeNull();
        expect(container.querySelector("script")).toBeNull();
    });

    it("converts legacy HTML into allowlisted content before rendering", () => {
        const { container, getByText } = renderSlide({
            id: "legacy-content",
            type: "content",
            html: `
                <div id="slide-content">
                    <h2 id="slide-title">Legacy deck</h2>
                    <script>globalThis.compromised = true</script>
                    <p onclick="globalThis.compromised = true">Retained text</p>
                    <img src="javascript:alert(1)" alt="Unsafe image">
                </div>
            `,
        });

        expect(getByText("Legacy deck")).toBeInTheDocument();
        expect(getByText("Retained text")).toBeInTheDocument();
        expect(container.querySelector("script")).toBeNull();
        expect(container.querySelector("[onclick]")).toBeNull();
        expect(container.querySelector("img")).toBeNull();
    });

    it("renders a stable image placeholder without requesting an image", () => {
        const { getByRole, getByText } = renderSlide({
            id: "placeholder",
            type: "content",
            layout: "image-right",
            title: "Product workflow",
            subtitle: "",
            blocks: [
                {
                    type: "paragraph",
                    region: "main",
                    text: "A concise explanation",
                },
                {
                    type: "image-placeholder",
                    region: "right",
                    alt: "Annotated product workflow screenshot",
                    caption: "Add the final product capture",
                },
            ],
        });

        expect(
            getByRole("img", { name: "Annotated product workflow screenshot" }),
        ).toBeInTheDocument();
        expect(getByText("Add the final product capture")).toBeInTheDocument();
    });

    it("renders final statistic values in inactive previews", () => {
        const slide: Slide = {
            id: "stats",
            type: "content",
            layout: "content",
            title: "Results",
            subtitle: "",
            blocks: [
                {
                    id: "metric",
                    type: "stats",
                    region: "main",
                    items: [{ value: "$12.5M", label: "Revenue" }],
                },
            ],
        };
        const { getByText } = render(
            <SlideRenderer slide={slide} currentTemplate="corporate-blue" isActive={false} />,
        );

        expect(getByText("$12.5M")).toBeInTheDocument();
    });
});
