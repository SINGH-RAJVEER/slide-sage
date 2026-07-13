import { describe, expect, it, mock } from "bun:test";
import { normalizePresentationSlides, processSlide } from "../../services/ai/presentation-content";
import {
    buildGenerationMessages,
    buildIterationMessages,
} from "../../services/ai/presentation-messages";
import {
    normalizeResearchOptions,
    resolveResearchSources,
    shouldSearchForResearch,
} from "../../services/ai/research-sources";

describe("AI presentation content", () => {
    it("normalizes HTML wrappers and duplicate slide IDs", () => {
        const slides = normalizePresentationSlides({
            slides: [
                { id: "duplicate", type: "content", html: "<h1>First</h1>" },
                {
                    id: "duplicate",
                    type: "content",
                    html: '<div id="slide-content"><h2>Second</h2></div>',
                },
            ],
        });

        expect(slides.map((slide) => slide.id)).toEqual(["duplicate", "slide-2"]);
        const firstSlide = slides[0];
        const secondSlide = slides[1];
        expect(firstSlide && "html" in firstSlide ? firstSlide.html : "").toBe(
            '<div id="slide-content"><h1>First</h1></div>'
        );
        expect(secondSlide && "html" in secondSlide ? secondSlide.html : "").toContain(
            "<h2>Second</h2>"
        );
    });

    it("converts invalid chart output into renderable content", () => {
        const slide = processSlide({ id: "chart", type: "chart" }, 0);

        expect(slide?.type).toBe("content");
        expect(slide && "html" in slide ? slide.html : "").toContain("Data Visualization");
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
