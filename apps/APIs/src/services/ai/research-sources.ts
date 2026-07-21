import type { ResearchOptions, ResearchPayload, Source } from "@slide-sage/types";

interface ResearchSearchClient {
    webSearch(query: string, options: ResearchOptions): Promise<Source[]>;
}

interface ResearchSourceRanker {
    rankSourcesBySemanticRelevance(
        query: string,
        sources: Source[],
        limit: number
    ): Promise<Source[]>;
}

interface ResolveResearchSourcesParams {
    query: string;
    research?: ResearchOptions;
    researchPayload?: ResearchPayload;
    searchClient: ResearchSearchClient;
    sourceRanker: ResearchSourceRanker;
}

export function normalizeResearchOptions(research?: ResearchOptions): ResearchOptions | undefined {
    return research && typeof research === "object" ? research : undefined;
}

export function shouldSearchForResearch(
    research: ResearchOptions | undefined,
    researchPayload?: ResearchPayload
): boolean {
    return Boolean(research?.enabled && !researchPayload);
}

export async function resolveResearchSources(
    params: ResolveResearchSourcesParams
): Promise<Source[]> {
    let sources: Source[];

    if (params.researchPayload && Array.isArray(params.researchPayload.sources)) {
        sources = params.researchPayload.sources;
    } else {
        sources = params.research?.enabled
            ? await params.searchClient.webSearch(params.query, {
                  ...params.research,
                  enabled: true,
              })
            : [];
    }

    if (!sources.length) return sources;
    return await params.sourceRanker.rankSourcesBySemanticRelevance(params.query, sources, 8);
}
