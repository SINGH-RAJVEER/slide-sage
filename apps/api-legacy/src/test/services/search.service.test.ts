import { beforeEach, describe, expect, it, mock } from "bun:test";

const cacheResolve = mock();
const fetchImpl = mock();

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
		delete process.env["EXA_API_KEY"];
		delete process.env["EXA_REQUEST_TIMEOUT_MS"];
		fetchImpl.mockReset();
		cacheResolve.mockReset();
		cacheResolve.mockImplementation(async (params: { load: () => Promise<unknown> }) => ({
			payload: await params.load(),
			status: "miss",
		}));
	});

	it("skips web search when Exa is not configured", async () => {
		const service = new SearchService(fetchImpl as unknown as typeof fetch);

		const sources = await service.webSearch("latest AI funding", { enabled: true });

		expect(sources).toEqual([]);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("searches Exa with an abortable fetch and normalizes source metadata", async () => {
		process.env["EXA_API_KEY"] = "exa_test_key";
		fetchImpl.mockResolvedValue(
			Response.json({
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
			})
		);

		const service = new SearchService(fetchImpl as unknown as typeof fetch);
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

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.exa.ai/search");
		expect(init.method).toBe("POST");
		expect(new Headers(init.headers).get("x-api-key")).toBe("exa_test_key");
		expect(init.signal).toBeInstanceOf(AbortSignal);
		expect(JSON.parse(String(init.body))).toEqual({
			query: "latest AI market",
			type: "auto",
			numResults: 8,
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

	it("propagates caller cancellation instead of converting it to an empty result", async () => {
		process.env["EXA_API_KEY"] = "exa_test_key";
		fetchImpl.mockImplementation((_url: string, init: RequestInit) => {
			return new Promise((_resolve, reject) => {
				init.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
					once: true,
				});
			});
		});
		const controller = new AbortController();
		const expected = new DOMException("caller stopped", "AbortError");
		const result = new SearchService(fetchImpl as unknown as typeof fetch).webSearch(
			"market topic",
			{ enabled: true },
			controller.signal
		);

		controller.abort(expected);

		await expect(result).rejects.toBe(expected);
	});

	it("aborts timed-out Exa requests and fails soft", async () => {
		process.env["EXA_API_KEY"] = "exa_test_key";
		process.env["EXA_REQUEST_TIMEOUT_MS"] = "5";
		const captured: { signal?: AbortSignal } = {};
		fetchImpl.mockImplementation((_url: string, init: RequestInit) => {
			captured.signal = init.signal as AbortSignal;
			return new Promise((_resolve, reject) => {
				init.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
					once: true,
				});
			});
		});

		const sources = await new SearchService(fetchImpl as unknown as typeof fetch).webSearch(
			"market topic",
			{ enabled: true }
		);

		expect(sources).toEqual([]);
		expect(captured.signal?.aborted).toBe(true);
	});

	it("serves shared cached sources without calling Exa", async () => {
		const cached = [{ url: "https://example.com/cached", title: "Cached" }];
		cacheResolve.mockResolvedValue({ payload: cached, status: "semantic-hit" });

		const sources = await new SearchService(fetchImpl as unknown as typeof fetch).webSearch(
			"similar market topic",
			{
				enabled: true,
			}
		);

		expect(sources).toEqual(cached);
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});
