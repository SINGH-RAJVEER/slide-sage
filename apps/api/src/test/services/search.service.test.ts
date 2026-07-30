import { beforeEach, describe, expect, it, mock } from "bun:test";

const exaSearch = mock();
const exaApiKeys: string[] = [];
const cacheResolve = mock();

class MockExa {
    search = exaSearch;

    constructor(apiKey?: string) {
        exaApiKeys.push(apiKey ?? "");
    }
}

mock.module("exa-js", () => ({
    default: MockExa,
}));

mock.module("../../services/rag.service", () => ({
    RAGService: class {},
}));

mock.module("../../services/semantic-cache.service", () => ({
    SemanticCacheService: class {
        resolve = cacheResolve;
    },
}));

const { SearchService } = await import("../../services/search.service");

describe("SearchService", () => {
    beforeEach(() => {
        exaSearch.mockReset();
        exaApiKeys.length = 0;
        delete process.env["EXA_API_KEY"];
        cacheResolve.mockReset();
        cacheResolve.mockImplementation(async (params: { load: () => Promise<unknown> }) => ({
            payload: await params.load(),
            status: "miss",
        }));
    });

    it("skips web search when Exa is not configured", async () => {
        const service = new SearchService();

        const sources = await service.webSearch("latest AI funding", { enabled: true });

        expect(sources).toEqual([]);
        expect(exaSearch).not.toHaveBeenCalled();
        expect(exaApiKeys).toEqual([]);
    });

    it("searches Exa with highlights, summaries, filters, and normalized source metadata", async () => {
        process.env["EXA_API_KEY"] = "exa_test_key";
        exaSearch.mockResolvedValue({
            results: [
                {
                    url: "https://example.com/report",
                    title: " AI Market Report ",
                    publishedDate: "2026-06-01",
                    author: "Analyst",
                    highlights: [" Strong growth in AI chips. ", ""],
                    summary: "AI chip demand accelerated.",
                },
                {
                    url: "ftp://invalid.example.com/report",
                    title: "Invalid",
                },
            ],
        });

        const service = new SearchService();
        const sources = await service.webSearch(" latest AI market ", {
            enabled: true,
            freshness: "week",
            maxResults: 12,
            includeDomains: ["example.com"],
            excludeDomains: ["spam.example"],
            startPublishedDate: "2026-01-01",
            endPublishedDate: "2026-06-30",
            maxAgeHours: 48,
        });

        expect(exaApiKeys).toEqual(["exa_test_key"]);
        expect(exaSearch).toHaveBeenCalledWith("latest AI market", {
            type: "auto",
            numResults: 10,
            includeDomains: ["example.com"],
            excludeDomains: ["spam.example"],
            startPublishedDate: "2026-01-01",
            endPublishedDate: "2026-06-30",
            contents: {
                highlights: {
                    query: "latest AI market",
                    maxCharacters: 1200,
                },
                summary: {
                    query: "latest AI market",
                },
                maxAgeHours: 48,
            },
        });
        expect(sources).toEqual([
            {
                url: "https://example.com/report",
                title: "AI Market Report",
                snippet: "AI chip demand accelerated.",
                retrieved_at: expect.any(String),
                published_date: "2026-06-01",
                author: "Analyst",
                highlights: ["Strong growth in AI chips."],
                summary: "AI chip demand accelerated.",
            },
        ]);
    });

    it("serves shared cached sources without calling Exa", async () => {
        const cached = [{ url: "https://example.com/cached", title: "Cached" }];
        cacheResolve.mockResolvedValue({ payload: cached, status: "semantic-hit" });

        const sources = await new SearchService().webSearch("similar market topic", {
            enabled: true,
        });

        expect(sources).toEqual(cached);
        expect(exaSearch).not.toHaveBeenCalled();
    });
});
