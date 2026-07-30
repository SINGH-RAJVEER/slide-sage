import type { ResearchOptions, Source } from "@slide-sage/types";
import Exa from "exa-js";
import { RAGService } from "./rag.service";
import { SemanticCacheService } from "./semantic-cache.service";

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
    private cacheService = new SemanticCacheService();

    async webSearch(query: string, options: ResearchOptions): Promise<Source[]> {
        if (!options.enabled) return [];

        const normalizedQuery = this.normalizeQuery(query);
        if (!normalizedQuery) return [];

        const maxResults = this.clampNumber(options.maxResults ?? 5, 1, 10);
        const maxAgeHours = this.resolveMaxAgeHours(options);
        const startPublishedDate =
            options.startPublishedDate ?? this.startPublishedDateForFreshness(options.freshness);

        if (maxAgeHours === 0) {
            return await this.searchExa(
                normalizedQuery,
                options,
                maxResults,
                maxAgeHours,
                startPublishedDate
            );
        }

        const result = await this.cacheService.resolve<Source[]>({
            namespace: "search",
            query: normalizedQuery,
            variant: {
                version: 1,
                maxResults,
                maxAgeHours,
                includeDomains: this.normalizeDomains(options.includeDomains),
                excludeDomains: this.normalizeDomains(options.excludeDomains),
                startPublishedDate,
                endPublishedDate: options.endPublishedDate,
                freshness: options.freshness,
            },
            ttlMs: this.resolveCacheTtlMs(options, maxAgeHours),
            load: () =>
                this.searchExa(
                    normalizedQuery,
                    options,
                    maxResults,
                    maxAgeHours,
                    startPublishedDate
                ),
            isCacheable: (sources) => sources.length > 0,
            isValid: this.isSourceArray,
        });
        console.info(`Search cache status=${result.status}`);
        return result.payload;
    }

    private async searchExa(
        normalizedQuery: string,
        options: ResearchOptions,
        maxResults: number,
        maxAgeHours: number | undefined,
        startPublishedDate: string | undefined
    ): Promise<Source[]> {
        const apiKey = process.env["EXA_API_KEY"];
        if (!apiKey) {
            console.warn("Web research enabled but EXA_API_KEY is not set; skipping search.");
            return [];
        }

        const exa = new Exa(apiKey);

        try {
            const result = await this.withTimeout(
                exa.search(normalizedQuery, {
                    type: "auto",
                    numResults: maxResults,
                    includeDomains: options.includeDomains,
                    excludeDomains: options.excludeDomains,
                    startPublishedDate,
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

    private resolveCacheTtlMs(options: ResearchOptions, maxAgeHours: number | undefined): number {
        const configured = Number.parseInt(process.env["SEARCH_CACHE_TTL_SECONDS"] ?? "", 10);
        if (Number.isFinite(configured) && configured > 0) return configured * 1000;

        const ttlHours = {
            day: 0.25,
            week: 1,
            month: 6,
            year: 24,
        }[options.freshness ?? "week"];
        const cappedHours =
            maxAgeHours === undefined
                ? ttlHours
                : Math.min(ttlHours, Math.max(1 / 60, maxAgeHours));
        return cappedHours * 60 * 60 * 1000;
    }

    private normalizeDomains(domains: string[] | undefined): string[] | undefined {
        if (!domains?.length) return undefined;
        return Array.from(
            new Set(domains.map((domain) => domain.trim().toLowerCase()).filter(Boolean))
        ).sort();
    }

    private isSourceArray(value: unknown): value is Source[] {
        return (
            Array.isArray(value) &&
            value.every(
                (source) =>
                    source !== null &&
                    typeof source === "object" &&
                    typeof (source as Source).url === "string"
            )
        );
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
