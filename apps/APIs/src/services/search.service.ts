import type { ResearchOptions, Source } from "@slide-sage/types";
import { RAGService } from "./rag.service";

export interface SearchSummaryResult {
    summary: string | null;
    tokensUsed: number;
    tokensEstimated: number;
}

interface BraveWebSearchResult {
    url?: string;
    title?: string;
    description?: string;
}

interface BraveWebSearchResponse {
    web?: {
        results?: BraveWebSearchResult[];
    };
}

export class SearchService {
    private ragService: RAGService | null = null;

    async webSearch(query: string, options: ResearchOptions): Promise<Source[]> {
        if (!options.enabled) return [];

        const apiKey = process.env.BRAVE_SEARCH_API_KEY;
        if (!apiKey) {
            console.warn(
                "Web research enabled but BRAVE_SEARCH_API_KEY is not set; skipping search."
            );
            return [];
        }

        const normalizedQuery = this.normalizeQuery(query);
        if (!normalizedQuery) return [];

        const maxResults = this.clampNumber(options.maxResults ?? 5, 1, 10);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8_000);

        try {
            const url = new URL("https://api.search.brave.com/res/v1/web/search");
            url.searchParams.set("q", normalizedQuery);
            url.searchParams.set("count", String(maxResults));
            url.searchParams.set("safesearch", "moderate");

            if (options.freshness) {
                url.searchParams.set("freshness", options.freshness);
            }

            const response = await fetch(url.toString(), {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    "X-Subscription-Token": apiKey,
                },
                signal: controller.signal,
            });

            if (!response.ok) {
                const body = await response.text();
                console.warn(
                    `Brave Search failed: ${response.status} ${response.statusText}`,
                    body
                );
                return [];
            }

            const data = (await response.json()) as BraveWebSearchResponse;
            const results = Array.isArray(data.web?.results) ? data.web?.results : [];

            const retrievedAt = new Date().toISOString();

            const sources: Source[] = [];
            for (const r of results) {
                const urlValue = typeof r.url === "string" ? r.url.trim() : "";
                if (!urlValue || !this.isLikelyHttpUrl(urlValue)) continue;

                sources.push({
                    url: urlValue,
                    title: typeof r.title === "string" ? r.title.trim() : undefined,
                    snippet: typeof r.description === "string" ? r.description.trim() : undefined,
                    retrieved_at: retrievedAt,
                });
            }

            return sources;
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                console.warn("Brave Search request timed out");
                return [];
            }
            console.warn("Brave Search request failed:", error);
            return [];
        } finally {
            clearTimeout(timeout);
        }
    }

    async summarizeSourcesDetailed(query: string, sources: Source[]): Promise<SearchSummaryResult> {
        if (!sources.length) {
            return { summary: null, tokensUsed: 0, tokensEstimated: 0 };
        }

        try {
            const trimmedQuery = this.normalizeQuery(query);
            const compactSources = sources.slice(0, 8).map((source) => ({
                url: source.url,
                title: source.title,
                snippet: source.snippet,
                retrieved_at: source.retrieved_at,
            }));

            const systemPrompt =
                "You are a research summarizer. Produce a compact, factual summary of the provided web results for the user's topic. Keep it concise and actionable. Use 4-7 bullet points max. Do not invent facts. If sources are thin, say so.";

            const userPromptText = `User topic: ${trimmedQuery || "(not provided)"}

Sources (JSON):
${JSON.stringify(compactSources, null, 2)}`;

            const formattedPrompt = `${systemPrompt}\n\n${userPromptText}`;
            const tokensEstimated = this.estimateTokens(formattedPrompt);

            const apiKey = process.env.OPEN_ROUTER_API_KEY;
            if (!apiKey) {
                throw new Error("OPEN_ROUTER_API_KEY is not set");
            }

            const model =
                process.env.OPEN_ROUTER_SEARCH_MODEL ||
                process.env.OPEN_ROUTER_MODEL ||
                "google/gemma-4-26b-a4b-it:free";

            const response = await fetch(
                process.env.OPEN_ROUTER_API_BASE || "https://openrouter.ai/api/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                        "HTTP-Referer": process.env.BASE_URL || "http://localhost:8000",
                        "X-OpenRouter-Title": "Slide Sage",
                    },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: userPromptText },
                        ],
                        temperature: 0.2,
                        max_tokens: 500,
                    }),
                }
            );

            if (!response.ok) {
                const body = await response.text();
                throw new Error(
                    `OpenRouter summarization failed: ${response.status} ${response.statusText} - ${body}`
                );
            }

            const result = await response.json();

            const summary =
                typeof result.choices?.[0]?.message?.content === "string"
                    ? result.choices[0].message.content.trim()
                    : "";

            const tokensUsed = result.usage?.total_tokens || 0;

            return {
                summary: summary || null,
                tokensUsed,
                tokensEstimated,
            };
        } catch (error) {
            console.warn("OpenRouter summarization failed:", error);
            return { summary: null, tokensUsed: 0, tokensEstimated: 0 };
        }
    }

    async summarizeSources(query: string, sources: Source[]): Promise<string | null> {
        const result = await this.summarizeSourcesDetailed(query, sources);
        return result.summary;
    }

    private estimateTokens(text: string): number {
        // Rough estimation: ~4 characters per token (OpenAI's guideline)
        return Math.ceil(text.length / 4);
    }

    private normalizeQuery(query: string): string {
        const q = String(query ?? "").trim();
        if (!q) return "";
        return q.length > 400 ? q.slice(0, 400) : q;
    }

    private clampNumber(value: number, min: number, max: number): number {
        if (!Number.isFinite(value)) return min;
        return Math.min(max, Math.max(min, Math.floor(value)));
    }

    private isLikelyHttpUrl(value: string): boolean {
        try {
            const u = new URL(value);
            return u.protocol === "https:" || u.protocol === "http:";
        } catch {
            return false;
        }
    }

    /**
     * Store search query with RAG embedding for future reference
     */
    async storeSearchWithEmbedding(
        userId: string,
        query: string,
        sources: Source[] = [],
        presentationId?: string
    ): Promise<void> {
        try {
            if (!this.ragService) {
                this.ragService = new RAGService();
            }

            await this.ragService.storeSearchEmbedding(userId, query);
            await this.ragService.storeSourceChunks(userId, query, sources, presentationId);
            console.log(`Stored search embedding for query: ${query.substring(0, 50)}...`);
        } catch (error) {
            console.warn("Failed to store search embedding:", error);
            // Non-critical, continue without RAG
        }
    }
}
