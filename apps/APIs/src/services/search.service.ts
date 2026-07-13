import type { ResearchOptions, Source } from "@slide-sage/types";
import Exa from "exa-js";
import { RAGService } from "./rag.service";

export interface SearchSummaryResult {
    summary: string | null;
    tokensUsed: number;
    tokensEstimated: number;
}

interface ExaSearchResult {
    url: string;
    title?: string | null;
    publishedDate?: string;
    author?: string;
    highlights?: string[];
    summary?: string;
}

export class SearchService {
    private ragService: RAGService | null = null;

    async webSearch(query: string, options: ResearchOptions): Promise<Source[]> {
        if (!options.enabled) return [];

        const apiKey = process.env["EXA_API_KEY"];
        if (!apiKey) {
            console.warn("Web research enabled but EXA_API_KEY is not set; skipping search.");
            return [];
        }

        const normalizedQuery = this.normalizeQuery(query);
        if (!normalizedQuery) return [];

        const maxResults = this.clampNumber(options.maxResults ?? 5, 1, 10);
        const maxAgeHours = this.resolveMaxAgeHours(options);
        const exa = new Exa(apiKey);

        try {
            const result = await this.withTimeout(
                exa.search(normalizedQuery, {
                    type: "auto",
                    numResults: maxResults,
                    includeDomains: options.includeDomains,
                    excludeDomains: options.excludeDomains,
                    startPublishedDate:
                        options.startPublishedDate ??
                        this.startPublishedDateForFreshness(options.freshness),
                    endPublishedDate: options.endPublishedDate,
                    contents: {
                        highlights: {
                            query: normalizedQuery,
                            maxCharacters: 1200,
                        },
                        summary: {
                            query: normalizedQuery,
                        },
                        maxAgeHours,
                    },
                }),
                10_000,
                "Exa search request timed out"
            );

            const retrievedAt = new Date().toISOString();
            const sources: Source[] = [];
            const results = Array.isArray(result.results)
                ? (result.results as ExaSearchResult[])
                : [];

            for (const item of results) {
                const url = item.url.trim();
                if (!url || !this.isLikelyHttpUrl(url)) continue;

                const highlights = Array.isArray(item.highlights)
                    ? item.highlights.map((highlight) => highlight.trim()).filter(Boolean)
                    : [];
                const summary = typeof item.summary === "string" ? item.summary.trim() : "";
                const snippet = summary || highlights[0];

                sources.push({
                    url,
                    title: typeof item.title === "string" ? item.title.trim() : undefined,
                    snippet,
                    retrieved_at: retrievedAt,
                    published_date: item.publishedDate,
                    author: item.author,
                    highlights,
                    summary: summary || undefined,
                });
            }

            return sources;
        } catch (error) {
            console.warn("Exa search request failed:", error);
            return [];
        }
    }

    private async withTimeout<T>(
        promise: Promise<T>,
        timeoutMs: number,
        message: string
    ): Promise<T> {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
        });

        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }

    private resolveMaxAgeHours(options: ResearchOptions): number | undefined {
        if (typeof options.maxAgeHours === "number" && Number.isFinite(options.maxAgeHours)) {
            return Math.max(0, Math.floor(options.maxAgeHours));
        }

        switch (options.freshness) {
            case "day":
                return 24;
            case "week":
                return 24 * 7;
            case "month":
                return 24 * 30;
            case "year":
                return 24 * 365;
            default:
                return undefined;
        }
    }

    private startPublishedDateForFreshness(
        freshness: ResearchOptions["freshness"]
    ): string | undefined {
        if (!freshness) return undefined;

        const date = new Date();
        const daysBack = {
            day: 1,
            week: 7,
            month: 30,
            year: 365,
        }[freshness];

        date.setDate(date.getDate() - daysBack);
        return date.toISOString().slice(0, 10);
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
                published_date: source.published_date,
                author: source.author,
                highlights: source.highlights?.slice(0, 4),
                summary: source.summary,
                retrieved_at: source.retrieved_at,
            }));

            const systemPrompt =
                "You are a research summarizer. Produce a compact, factual summary of the provided web results for the user's topic. Keep it concise and actionable. Use 4-7 bullet points max. Do not invent facts. If sources are thin, say so.";

            const userPromptText = `User topic: ${trimmedQuery || "(not provided)"}

Sources (JSON):
${JSON.stringify(compactSources, null, 2)}`;

            const formattedPrompt = `${systemPrompt}\n\n${userPromptText}`;
            const tokensEstimated = this.estimateTokens(formattedPrompt);

            const apiKey = process.env["OPEN_ROUTER_API_KEY"];
            if (!apiKey) {
                throw new Error("OPEN_ROUTER_API_KEY is not set");
            }

            const model =
                process.env["OPEN_ROUTER_SEARCH_MODEL"] ||
                process.env["OPEN_ROUTER_MODEL"] ||
                "google/gemma-4-26b-a4b-it:free";

            const response = await fetch(
                process.env["OPEN_ROUTER_API_BASE"] ||
                    "https://openrouter.ai/api/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                        "HTTP-Referer": process.env["BASE_URL"] || "http://localhost:8000",
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

    async storeSourceChunks(
        userId: string,
        query: string,
        sources: Source[] = [],
        presentationId?: string
    ): Promise<void> {
        try {
            if (!this.ragService) {
                this.ragService = new RAGService();
            }

            await this.ragService.storeSourceChunks(userId, query, sources, presentationId);
            console.log(`Stored source chunks for query: ${query.substring(0, 50)}...`);
        } catch (error) {
            console.warn("Failed to store source chunks:", error);
            // Non-critical, continue without RAG
        }
    }
}
