import { beforeEach, describe, expect, it, mock } from "bun:test";

const freeEmbeddingModel = "nvidia/llama-nemotron-embed-vl-1b-v2:free";

const tableNames = [
    "deck_memories",
    "example_generations",
    "feedback_memories",
    "presentation_embeddings",
    "prompt_events",
    "rag_context",
    "search_embeddings",
    "semantic_commands",
    "slide_embeddings",
    "slide_templates",
    "source_chunks",
    "style_memories",
] as const;

type TableName = (typeof tableNames)[number];
type InsertedRows = Record<TableName, unknown[]>;

type TableRef = {
    __name: TableName;
};

type ColumnRef = {
    __table: TableName;
    __column: string;
    op: (operator: string) => { table: TableName; column: string; operator: string };
};

const insertedRows = Object.fromEntries(tableNames.map((name) => [name, []])) as InsertedRows;

const deletedTables: TableName[] = [];

function makeTable(name: TableName): TableRef {
    return new Proxy(
        { __name: name },
        {
            get(target, property) {
                if (property in target) {
                    return target[property as keyof TableRef];
                }

                const column = String(property);
                return {
                    __table: name,
                    __column: column,
                    op: (operator: string) => ({ table: name, column, operator }),
                } satisfies ColumnRef;
            },
        }
    ) as TableRef;
}

function getTableName(table: unknown): TableName {
    if (
        table &&
        typeof table === "object" &&
        "__name" in table &&
        tableNames.includes(table.__name as TableName)
    ) {
        return table.__name as TableName;
    }

    throw new Error("Unknown table reference");
}

function resetRows(): void {
    for (const name of tableNames) {
        insertedRows[name] = [];
    }
    deletedTables.length = 0;
}

type SelectChain = unknown[] & {
    from: (table: unknown) => SelectChain;
    where: (condition: unknown) => SelectChain;
    orderBy: (order: unknown) => SelectChain;
    limit: (limit: number) => Promise<unknown[]>;
};

function makeSelectChain(): SelectChain {
    const chain = [] as unknown[] as SelectChain;
    chain.from = (_table: unknown) => chain;
    chain.where = (_condition: unknown) => chain;
    chain.orderBy = (_order: unknown) => chain;
    chain.limit = (_limit: number) => Promise.resolve([]);

    return chain;
}

const db = {
    insert: (table: unknown) => {
        const name = getTableName(table);
        return {
            values: (value: unknown) => {
                if (Array.isArray(value)) {
                    insertedRows[name].push(...value);
                } else {
                    insertedRows[name].push(value);
                }

                return {
                    returning: () => Promise.resolve([{ id: `${name}_1` }]),
                };
            },
        };
    },
    delete: (table: unknown) => {
        const name = getTableName(table);
        deletedTables.push(name);
        return {
            where: (_condition: unknown) => Promise.resolve({ rowCount: 1 }),
        };
    },
    select: (_selection?: unknown) => makeSelectChain(),
};

mock.module("drizzle-orm", () => ({
    and: (...conditions: unknown[]) => ({ type: "and", conditions }),
    cosineDistance: (column: unknown, embedding: number[]) => ({
        type: "cosineDistance",
        column,
        embedding,
    }),
    desc: (expression: unknown) => ({ type: "desc", expression }),
    eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
    isNull: (value: unknown) => ({ type: "isNull", value }),
    or: (...conditions: unknown[]) => ({ type: "or", conditions }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        type: "sql",
        strings: [...strings],
        values,
    }),
}));

mock.module("@slide-sage/database", () => ({
    db,
    deckMemories: makeTable("deck_memories"),
    exampleGenerations: makeTable("example_generations"),
    feedbackMemories: makeTable("feedback_memories"),
    presentationEmbeddings: makeTable("presentation_embeddings"),
    promptEvents: makeTable("prompt_events"),
    ragContext: makeTable("rag_context"),
    searchEmbeddings: makeTable("search_embeddings"),
    semanticCommands: makeTable("semantic_commands"),
    slideEmbeddings: makeTable("slide_embeddings"),
    slideTemplates: makeTable("slide_templates"),
    sourceChunks: makeTable("source_chunks"),
    styleMemories: makeTable("style_memories"),
}));

const { RAGService } = await import("../../services/rag.service");

function stubEmbeddingGeneration(service: InstanceType<typeof RAGService>): void {
    service.generateEmbedding = mock(async (text: string) => {
        const normalized = text.toLowerCase();
        const embedding =
            normalized.includes("competitor b") || normalized.includes("beta")
                ? [0, 1, 0]
                : [1, 0, 0];

        return {
            embedding,
            model: freeEmbeddingModel,
        };
    }) as typeof service.generateEmbedding;
}

describe("RAGService semantic embeddings", () => {
    beforeEach(() => {
        resetRows();
        process.env.EMBEDDING_MODEL = freeEmbeddingModel;
        process.env.OPEN_ROUTER_API_KEY = "test-openrouter-key";
        process.env.OPEN_ROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
        globalThis.fetch = mock();
    });

    it("uses the free OpenRouter embedding model and 768 dimensions in embedding requests", async () => {
        const fetchMock = mock(async () => {
            return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        });
        globalThis.fetch = fetchMock as typeof fetch;

        const service = new RAGService();
        const result = await service.generateEmbedding("investor pitch deck");

        expect(result.model).toBe(freeEmbeddingModel);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const request = fetchMock.mock.calls[0]?.[1];
        const body = JSON.parse(String(request?.body)) as {
            model: string;
            dimensions: number;
            input: string;
        };

        expect(body).toEqual({
            model: freeEmbeddingModel,
            input: "investor pitch deck",
            encoding_format: "float",
            dimensions: 768,
        });
    });

    it("stores semantic memory rows for every new generation embedding surface", async () => {
        const service = new RAGService();
        stubEmbeddingGeneration(service);

        await service.storePresentationSemanticMemory({
            presentationId: "presentation_1",
            userId: "user_1",
            prompt: "Create a market opportunity deck",
            title: "Market Opportunity",
            theme: "modern",
            operation: "generation",
            detailLevel: "balanced",
            tonality: "professional",
            slides: [
                {
                    id: "slide_1",
                    type: "content",
                    html: "<div><h2>Market</h2><p>Large opportunity</p></div>",
                },
                {
                    id: "slide_2",
                    type: "chart",
                    chartConfig: {
                        type: "bar",
                        data: { labels: ["A"], datasets: [{ data: [10] }] },
                    },
                },
            ],
            sources: [
                {
                    url: "https://example.com/report",
                    title: "Market report",
                    snippet: "Market is growing",
                    retrieved_at: "2026-07-01T00:00:00.000Z",
                },
            ],
        });

        expect(deletedTables).toEqual([
            "slide_embeddings",
            "deck_memories",
            "style_memories",
            "source_chunks",
        ]);
        expect(insertedRows.presentation_embeddings).toHaveLength(1);
        expect(insertedRows.prompt_events).toHaveLength(1);
        expect(insertedRows.deck_memories).toHaveLength(1);
        expect(insertedRows.slide_embeddings).toHaveLength(2);
        expect(insertedRows.style_memories).toHaveLength(1);
        expect(insertedRows.example_generations).toHaveLength(1);
        expect(insertedRows.source_chunks).toHaveLength(1);
        expect(insertedRows.semantic_commands).toHaveLength(10);
        expect(insertedRows.feedback_memories).toHaveLength(0);

        expect(insertedRows.prompt_events[0]).toMatchObject({
            presentationId: "presentation_1",
            userId: "user_1",
            userPrompt: "Create a market opportunity deck",
            interpretedIntent: "general_edit",
            embeddingModel: freeEmbeddingModel,
        });
        expect(insertedRows.slide_embeddings[0]).toMatchObject({
            presentationId: "presentation_1",
            userId: "user_1",
            slideId: "slide_1",
            slideIndex: 0,
            slideType: "content",
            title: "Market",
            embeddingModel: freeEmbeddingModel,
        });
        expect(insertedRows.source_chunks[0]).toMatchObject({
            presentationId: "presentation_1",
            userId: "user_1",
            sourceUrl: "https://example.com/report",
            title: "Market report",
            embeddingModel: freeEmbeddingModel,
        });
    });

    it("stores feedback memory for iteration embeddings", async () => {
        const service = new RAGService();
        stubEmbeddingGeneration(service);

        await service.storePresentationSemanticMemory({
            presentationId: "presentation_1",
            userId: "user_1",
            prompt: "Make slide 2 more investor focused",
            title: "Updated Deck",
            theme: "modern",
            operation: "iteration",
            slides: [
                {
                    id: "slide_1",
                    type: "content",
                    html: "<div><h2>Investor Story</h2></div>",
                },
            ],
        });

        expect(insertedRows.feedback_memories).toHaveLength(1);
        expect(insertedRows.feedback_memories[0]).toMatchObject({
            presentationId: "presentation_1",
            userId: "user_1",
            feedbackText: "Make slide 2 more investor focused",
            outcome: "applied",
            embeddingModel: freeEmbeddingModel,
        });
    });

    it("seeds slide template embeddings for generation memory retrieval", async () => {
        const service = new RAGService();
        stubEmbeddingGeneration(service);

        const context = await service.buildGenerationMemoryContextString(
            "user_1",
            "Show the next twelve months roadmap"
        );

        expect(context).toBe("");
        expect(insertedRows.slide_templates).toHaveLength(8);
        expect(
            insertedRows.slide_templates.map(
                (row) => (row as { templateName: string }).templateName
            )
        ).toContain("Timeline Roadmap");
        expect(insertedRows.slide_templates[0]).toMatchObject({
            embeddingModel: freeEmbeddingModel,
            metadata: { seeded: true },
        });
    });

    it("ranks fresh sources by embedding similarity before grounding", async () => {
        const service = new RAGService();
        stubEmbeddingGeneration(service);

        const ranked = await service.rankSourcesBySemanticRelevance("market trends", [
            {
                url: "https://example.com/b",
                title: "Competitor B source",
                snippet: "Beta market details",
            },
            {
                url: "https://example.com/a",
                title: "Alpha source",
                snippet: "Market trends and opportunity",
            },
        ]);

        expect(ranked.map((source) => source.url)).toEqual([
            "https://example.com/a",
            "https://example.com/b",
        ]);
    });
});
