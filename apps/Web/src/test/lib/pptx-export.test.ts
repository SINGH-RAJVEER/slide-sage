import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import { buildEditablePptx } from "@/lib/pptx-export";
import type {
    ContentSlide,
    PresentationData,
    SlideBlock,
    SlideLayout,
} from "@/modules/types/presentation";

const contentSlide = (
    layout: SlideLayout,
    blocks: SlideBlock[],
    overrides: Partial<ContentSlide> = {},
): ContentSlide => ({
    id: `${layout}-slide`,
    type: "content",
    layout,
    title: "Editable Quarterly Review",
    subtitle: "A native composition",
    tone: "default",
    density: "standard",
    pattern: "none",
    blocks,
    ...overrides,
});

const presentation = (slides: PresentationData["slides"]): PresentationData => ({
    title: "Editable Quarterly Review",
    theme: "corporate-blue",
    totalSlides: slides.length,
    slides,
});

const paragraph = (region: SlideBlock["region"], text: string): SlideBlock => ({
    type: "paragraph",
    region,
    text,
});

async function archiveFor(slides: PresentationData["slides"]) {
    const pptx = await buildEditablePptx(presentation(slides));
    const output = await pptx.write({ outputType: "arraybuffer", compression: true });
    return JSZip.loadAsync(output as ArrayBuffer);
}

describe("editable PPTX export", () => {
    test("writes schema-v5 body content, tables, and charts as native objects", async () => {
        const archive = await archiveFor([
            contentSlide("body", [
                {
                    type: "bullets",
                    region: "main",
                    items: [
                        "Revenue increased by 24 percent",
                        "Customer retention reached 91 percent",
                    ],
                    ordered: false,
                },
                {
                    type: "table",
                    region: "main",
                    headers: ["Quarter", "Revenue"],
                    rows: [["Q2", "$1.4M"]],
                },
            ]),
            {
                id: "chart-slide",
                type: "chart",
                chartConfig: {
                    type: "bar",
                    title: "Revenue by quarter",
                    description: "Quarterly revenue in millions",
                    data: {
                        labels: ["Q1", "Q2"],
                        datasets: [
                            {
                                label: "Revenue",
                                data: [1.1, 1.4],
                                backgroundColor: "#2563EB",
                            },
                        ],
                    },
                },
            },
        ]);
        const firstSlide = await archive.file("ppt/slides/slide1.xml")?.async("string");
        const secondSlide = await archive.file("ppt/slides/slide2.xml")?.async("string");
        const chartFile = archive.file(/^ppt\/charts\/chart\d+\.xml$/)[0];
        const chart = await chartFile?.async("string");

        expect(firstSlide).toContain("Revenue increased by 24 percent");
        expect(firstSlide).toContain("<a:tbl>");
        expect(firstSlide).toContain("Quarter");
        expect(secondSlide).toContain("<c:chart");
        expect(chart).toContain("<c:barChart>");
    });

    test("uses native geometry for every schema-v5 composition", async () => {
        const layouts: SlideLayout[] = [
            "cover",
            "section",
            "body",
            "split",
            "comparison",
            "sidebar",
            "media-left",
            "media-right",
            "quote",
            "spotlight",
            "canvas",
        ];
        const archive = await archiveFor(
            layouts.map((layout) =>
                contentSlide(
                    layout,
                    [
                        paragraph("primary", `${layout} primary`),
                        paragraph("secondary", `${layout} secondary`),
                        {
                            type: "image-placeholder",
                            region: "media",
                            alt: `${layout} media`,
                            caption: "Editable visual",
                        },
                    ],
                    layout === "spotlight"
                        ? {
                              blocks: [
                                  {
                                      ...paragraph("primary", "spotlight hero"),
                                      emphasis: "hero",
                                  },
                                  paragraph("secondary", "spotlight support"),
                              ],
                          }
                        : {},
                ),
            ),
        );
        const xml = await Promise.all(
            layouts.map((_, index) =>
                archive.file(`ppt/slides/slide${index + 1}.xml`)?.async("string"),
            ),
        );

        expect(xml[0]).toContain("Cover divider");
        expect(xml[1]).toContain("Section mark");
        expect(xml[3]).toContain("Split divider");
        expect(xml[4]).toContain("Comparison primary surface");
        expect(xml[4]).toContain("Comparison secondary surface");
        expect(xml[5]).toContain("Sidebar rail");
        expect(xml[6]).toContain("Media surface");
        expect(xml[6]).toContain("media-left media");
        expect(xml[7]).toContain("Media support divider");
        expect(xml[8]).toContain("Quote divider");
        expect(xml[9]).toContain("Spotlight hero surface");
        expect(xml[9]).toContain("Spotlight support divider");
        expect(xml[10]).toContain("Canvas cell 1");
    });

    test("exports composition metadata through editable text and shape styling", async () => {
        const tinyPng =
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+AvzZAAAAAElFTkSuQmCC";
        const archive = await archiveFor([
            contentSlide(
                "comparison",
                [
                    {
                        ...paragraph("primary", "The emphasized proposal"),
                        emphasis: "hero",
                        treatment: "accent",
                    },
                    {
                        ...paragraph("secondary", "The supporting evidence"),
                        emphasis: "supporting",
                        treatment: "outline",
                    },
                ],
                {
                    eyebrow: "Field note",
                    regionLabels: { primary: "Now", secondary: "Next" },
                    tone: "accent",
                    pattern: "grid",
                    backgroundImage: {
                        url: tinyPng,
                        alt: "Subtle backdrop",
                        focalPoint: "center",
                        overlay: "medium",
                    },
                },
            ),
        ]);
        const slide = await archive.file("ppt/slides/slide1.xml")?.async("string");

        expect(slide).toContain("FIELD NOTE");
        expect(slide).toContain("NOW");
        expect(slide).toContain("NEXT");
        expect(slide).toContain("Block treatment accent");
        expect(slide).toContain("Block treatment outline");
        expect(slide).toContain("Slide background image");
        expect(slide).toContain("Background image overlay");
    });

    test("normalizes legacy HTML before composing native content", async () => {
        const archive = await archiveFor([
            {
                id: "legacy-split",
                type: "content",
                html: `
                    <div id="slide-content" class="layout-two-col">
                        <h2 id="slide-title">Legacy comparison</h2>
                        <div class="two-column">
                            <div class="column"><p>Legacy primary</p></div>
                            <div class="column"><p>Legacy secondary</p></div>
                        </div>
                    </div>
                `,
            },
        ]);
        const slide = await archive.file("ppt/slides/slide1.xml")?.async("string");

        expect(slide).toContain("Legacy comparison");
        expect(slide).toContain("Legacy primary");
        expect(slide).toContain("Legacy secondary");
        expect(slide).toContain("Split divider");
    });

    test("uses a native radar chart for polar-area source data", async () => {
        const archive = await archiveFor([
            {
                id: "polar-chart",
                type: "chart",
                chartConfig: {
                    type: "polarArea",
                    data: {
                        labels: ["Quality", "Speed", "Cost"],
                        datasets: [{ label: "Score", data: [8, 6, 7] }],
                    },
                },
            },
        ]);
        const chartFile = archive.file(/^ppt\/charts\/chart\d+\.xml$/)[0];
        const chart = await chartFile?.async("string");

        expect(chart).toContain("<c:radarChart>");
        expect(chart).toContain("Quality");
    });

    test("preserves widgets as native editable nodes, connectors, and text", async () => {
        const archive = await archiveFor([
            contentSlide("body", [
                {
                    type: "widget",
                    region: "main",
                    version: 1,
                    kind: "flow",
                    direction: "horizontal",
                    nodes: [
                        {
                            id: "build",
                            role: "start",
                            label: "Build",
                            description: "",
                            value: "",
                            tone: "neutral",
                            parentId: "",
                        },
                        {
                            id: "ship",
                            role: "end",
                            label: "Ship",
                            description: "",
                            value: "",
                            tone: "positive",
                            parentId: "",
                        },
                    ],
                    edges: [{ from: "build", to: "ship", label: "approved" }],
                },
            ]),
        ]);
        const slide = await archive.file("ppt/slides/slide1.xml")?.async("string");

        expect(slide).toContain("Widget node 1");
        expect(slide).toContain("Widget connector 1");
        expect(slide).toContain("Build");
        expect(slide).toContain("approved");
    });
});
