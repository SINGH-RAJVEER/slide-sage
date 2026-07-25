import { describe, expect, it, mock } from "bun:test";
import { normalizePresentationSlides, processSlide } from "../../services/ai/presentation-content";
import { compilePresentationScenes } from "../../services/ai/presentation-design";
import {
    buildGenerationMessages,
    buildIterationMessages,
} from "../../services/ai/presentation-messages";
import {
    normalizeResearchOptions,
    resolveResearchSources,
    shouldSearchForResearch,
} from "../../services/ai/research-sources";
import { buildGenerationPrompt, buildIterationPrompt } from "../../services/ai-prompts";

describe("AI presentation content", () => {
    it("normalizes structured blocks, layout regions, and duplicate slide IDs", () => {
        const slides = normalizePresentationSlides({
            slides: [
                {
                    id: "slide-2",
                    type: "content",
                    layout: "content",
                    title: "First",
                    subtitle: "",
                    blocks: [
                        {
                            type: "bullets",
                            region: "right",
                            items: ["One", "Two"],
                            ordered: false,
                            ignored: "not retained",
                        },
                    ],
                },
                {
                    id: "slide-2",
                    type: "content",
                    layout: "two-column",
                    title: "Second",
                    subtitle: "Details",
                    blocks: [{ type: "paragraph", region: "main", text: "Left column" }],
                },
            ],
        });

        expect(slides.map((slide) => slide.id)).toEqual(["slide-2", "slide-2-2"]);
        const firstSlide = slides[0];
        const secondSlide = slides[1];
        expect(firstSlide?.type).toBe("content");
        expect(firstSlide?.type === "content" ? firstSlide.blocks : []).toEqual([
            {
                id: "slide-2-block-1",
                type: "bullets",
                region: "main",
                sourceIds: [],
                items: ["One", "Two"],
                ordered: false,
            },
        ]);
        expect(secondSlide?.type === "content" ? secondSlide.blocks[0]?.region : "").toBe("left");
    });

    it("converts invalid chart output into renderable content", () => {
        const slide = processSlide({ id: "chart", type: "chart" }, 0);

        expect(slide?.type).toBe("content");
        expect(slide?.type === "content" ? slide.title : "").toBe("Data Visualization");
        expect(slide?.type === "content" ? slide.blocks[0] : null).toEqual({
            id: "chart-block-1",
            type: "paragraph",
            region: "main",
            sourceIds: [],
            text: "Chart data unavailable",
        });
    });

    it("keeps chart data while dropping arbitrary model-controlled options", () => {
        const slide = processSlide(
            {
                id: "chart",
                type: "chart",
                chartConfig: {
                    type: "bar",
                    title: "Revenue",
                    description: "Quarterly revenue",
                    data: {
                        labels: ["Q1", "Q2"],
                        datasets: [{ label: "Revenue", data: [10, 12] }],
                    },
                    options: { plugins: { tooltip: { external: "model-controlled" } } },
                },
            },
            0
        );

        expect(slide?.type).toBe("chart");
        expect(slide?.type === "chart" ? slide.chartConfig.options : null).toEqual({});
    });

    it("normalizes image placeholders without requiring a remote URL", () => {
        const slide = processSlide(
            {
                id: "visual",
                type: "content",
                layout: "image-right",
                title: "Product workflow",
                subtitle: "",
                blocks: [
                    {
                        type: "image-placeholder",
                        region: "right",
                        alt: "Annotated product workflow screenshot",
                        caption: "Add the final product capture",
                        ignored: "discarded",
                    },
                ],
            },
            0
        );

        expect(slide?.type === "content" ? slide.blocks[0] : null).toEqual({
            id: "visual-block-1",
            type: "image-placeholder",
            region: "right",
            sourceIds: [],
            alt: "Annotated product workflow screenshot",
            caption: "Add the final product capture",
        });
    });

    it("rejects executable markup and unsafe image protocols", () => {
        expect(
            processSlide(
                {
                    id: "unsafe",
                    type: "content",
                    layout: "content",
                    title: "<script>alert(1)</script>",
                    subtitle: "",
                    blocks: [
                        {
                            type: "image",
                            region: "main",
                            url: "javascript:alert(1)",
                            alt: "Unsafe",
                            caption: "",
                        },
                        {
                            type: "paragraph",
                            region: "main",
                            text: "<img src=x onerror=alert(1)>",
                        },
                    ],
                },
                0
            )
        ).toEqual({
            id: "unsafe",
            type: "content",
            transition: { type: "none", durationMs: 0 },
            effects: [],
            layout: "content",
            title: "<script>alert(1)</script>",
            subtitle: "",
            blocks: [
                {
                    id: "unsafe-block-1",
                    type: "paragraph",
                    region: "main",
                    sourceIds: [],
                    text: "<img src=x onerror=alert(1)>",
                },
            ],
        });
    });
});

describe("AI presentation design", () => {
    it("maps semantic intent to dynamic scenes and creates a visual placeholder", () => {
        const slides = normalizePresentationSlides({
            slides: [
                {
                    id: "slide-1",
                    type: "content",
                    layout: "content",
                    title: "Opening",
                    subtitle: "",
                    blocks: [],
                },
                {
                    id: "slide-2",
                    type: "content",
                    layout: "content",
                    title: "Workflow",
                    subtitle: "",
                    blocks: [
                        {
                            type: "bullets",
                            region: "main",
                            items: ["Normalize input", "Draft cards"],
                            ordered: true,
                        },
                    ],
                },
            ],
        });
        const designed = compilePresentationScenes(slides, {
            title: "System",
            audience: "Builders",
            thesis: "A staged pipeline creates coherent decks.",
            cards: [
                {
                    id: "card-1",
                    title: "Opening",
                    objective: "Introduce",
                    keyPoints: [],
                    narrativeRole: "opening",
                    visualIntent: "none",
                    sourceIds: [],
                },
                {
                    id: "card-2",
                    title: "Workflow",
                    objective: "Explain the workflow",
                    keyPoints: [],
                    narrativeRole: "process",
                    visualIntent: "image",
                    sourceIds: [],
                },
            ],
        });

        expect(designed[0]?.strategy).toBe("typographic-cover");
        expect(designed[1]?.strategy).toBe("media-left");
        expect(
            designed[1]?.root.children.some(
                (node) =>
                    node.type === "image" ||
                    (node.type === "group" && node.children.some((child) => child.type === "image"))
            )
        ).toBe(true);
    });
});

describe("AI presentation prompts", () => {
    it("requires content-only schema V3 output for generation and iteration", () => {
        const generationPrompt = buildGenerationPrompt("balanced", "professional", "nature-green");
        const iterationPrompt = buildIterationPrompt("Improve the comparison");

        expect(generationPrompt).toContain('Set "schemaVersion" to 3');
        expect(generationPrompt).toContain("Never return HTML, Markdown, CSS, JSX, JavaScript");
        expect(generationPrompt).toContain('"type": "content"');
        expect(generationPrompt).toContain('theme to exactly "nature-green"');
        expect(generationPrompt).toContain("Vary layouts naturally");
        expect(generationPrompt).toContain("image-placeholder");
        expect(iterationPrompt).toContain("Always output schema version 3");
        expect(iterationPrompt).toContain("Improve the comparison");
    });
});

describe("AI presentation messages", () => {
    it("builds generation and iteration messages with shared research context", () => {
        const sources = [{ url: "https://example.com", title: "Research source" }];
        const generationMessages = buildGenerationMessages({
            systemPrompt: "Generate a deck",
            generationMemoryContext: "Past deck context",
            researchSources: sources,
            userPrompt: "Storage market",
            slideCount: 5,
        });
        const iterationMessages = buildIterationMessages({
            systemPrompt: "Revise the deck",
            researchSources: sources,
            feedback: "Add current data",
        });

        expect(generationMessages.map((message) => message.role)).toEqual([
            "system",
            "system",
            "system",
            "user",
        ]);
        expect(generationMessages[2]?.content).toContain("Research source");
        expect(iterationMessages.map((message) => message.role)).toEqual([
            "system",
            "system",
            "user",
        ]);
        expect(iterationMessages[1]?.content).toContain("Add current data");
    });
});

describe("AI research sources", () => {
    it("searches only when needed and always ranks selected sources", async () => {
        const searchedSources = [{ url: "https://example.com/search" }];
        const rankedSources = [{ url: "https://example.com/ranked" }];
        const webSearch = mock(() => Promise.resolve(searchedSources));
        const rankSourcesBySemanticRelevance = mock(() => Promise.resolve(rankedSources));
        const research = normalizeResearchOptions({ enabled: true, maxResults: 4 });

        expect(shouldSearchForResearch(research)).toBe(true);
        expect(
            shouldSearchForResearch(research, {
                sources: [{ url: "https://example.com/provided" }],
            })
        ).toBe(false);

        const sources = await resolveResearchSources({
            query: "Storage market",
            research,
            searchClient: { webSearch },
            sourceRanker: { rankSourcesBySemanticRelevance },
        });

        expect(webSearch).toHaveBeenCalledWith("Storage market", {
            enabled: true,
            maxResults: 4,
        });
        expect(rankSourcesBySemanticRelevance).toHaveBeenCalledWith(
            "Storage market",
            searchedSources,
            8
        );
        expect(sources).toEqual(rankedSources);
    });
});
