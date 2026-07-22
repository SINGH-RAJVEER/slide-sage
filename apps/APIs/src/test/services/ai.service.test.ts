import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("../../services/rag.service", () => ({
    RAGService: class {
        buildGenerationMemoryContextString = mock(() => Promise.resolve(""));
    },
}));

mock.module("../../services/search.service", () => ({
    SearchService: class {},
}));

const { AIService } = await import("../../services/ai.service");
const originalFetch = globalThis.fetch;

function openRouterResponse(content: string, splitAt = 0): Response {
    const encoder = new TextEncoder();
    const body = [
        `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [], usage: { total_tokens: 42 } })}\n\n`,
        "data: [DONE]\n\n",
    ].join("");
    const bytes = encoder.encode(body);
    const parts = splitAt > 0 ? [bytes.slice(0, splitAt), bytes.slice(splitAt)] : [bytes];

    return new Response(
        new ReadableStream<Uint8Array>({
            start(controller) {
                for (const part of parts) controller.enqueue(part);
                controller.close();
            },
        })
    );
}

function interruptedOpenRouterResponse(content: string): Response {
    const encoder = new TextEncoder();
    let sent = false;

    return new Response(
        new ReadableStream<Uint8Array>({
            pull(controller) {
                if (!sent) {
                    sent = true;
                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
                        )
                    );
                    return;
                }
                controller.error(new Error("connection reset"));
            },
        })
    );
}

function validDeck(title = "Reliable Deck"): string {
    return JSON.stringify({
        schemaVersion: 2,
        title,
        theme: "minimalist",
        slides: [
            {
                id: "slide-1",
                type: "content",
                layout: "title",
                title,
                subtitle: "",
                blocks: [],
            },
        ],
        totalSlides: 1,
    });
}

async function collectGenerationEvents(service: InstanceType<typeof AIService>) {
    const events = [];
    for await (const event of service.generatePresentationStream(
        "Resilient systems",
        1,
        "balanced",
        "professional"
    )) {
        events.push(event);
    }
    return events;
}

describe("AIService resilient presentation generation", () => {
    beforeEach(() => {
        process.env["OPEN_ROUTER_API_KEY"] = "test-key";
        process.env["OPEN_ROUTER_MAX_ATTEMPTS"] = "3";
        process.env["OPEN_ROUTER_RETRY_BASE_DELAY_MS"] = "1";
        process.env["OPEN_ROUTER_RETRY_MAX_DELAY_MS"] = "1";
        process.env["OPEN_ROUTER_REQUEST_TIMEOUT_MS"] = "100";
        process.env["OPEN_ROUTER_STREAM_IDLE_TIMEOUT_MS"] = "100";
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        delete process.env["OPEN_ROUTER_API_KEY"];
        delete process.env["OPEN_ROUTER_MAX_ATTEMPTS"];
        delete process.env["OPEN_ROUTER_RETRY_BASE_DELAY_MS"];
        delete process.env["OPEN_ROUTER_RETRY_MAX_DELAY_MS"];
        delete process.env["OPEN_ROUTER_REQUEST_TIMEOUT_MS"];
        delete process.env["OPEN_ROUTER_STREAM_IDLE_TIMEOUT_MS"];
    });

    it("requests a strict schema and an explicit output budget", async () => {
        let requestBody: Record<string, unknown> | undefined;
        const fetchMock = mock((_url: string | URL | Request, init?: RequestInit) => {
            requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
            return Promise.resolve(openRouterResponse(validDeck()));
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const events = await collectGenerationEvents(new AIService());
        const responseFormat = requestBody?.["response_format"] as
            | { json_schema?: { strict?: boolean; schema?: Record<string, unknown> } }
            | undefined;
        const schema = responseFormat?.json_schema?.schema as
            | {
                  properties?: {
                      schemaVersion?: unknown;
                      slides?: Record<string, unknown>;
                      totalSlides?: unknown;
                  };
              }
            | undefined;

        expect(events.at(-1)?.event).toBe("complete");
        expect(requestBody?.["model"]).toBe("google/gemma-4-26b-a4b-it");
        expect(requestBody?.["max_tokens"]).toBe(4096);
        expect(responseFormat?.json_schema?.strict).toBe(true);
        expect(schema?.properties?.slides?.["minItems"]).toBe(1);
        expect(schema?.properties?.slides?.["maxItems"]).toBe(1);
        expect(schema?.properties?.totalSlides).toEqual({ const: 1 });
        expect(schema?.properties?.schemaVersion).toEqual({ const: 2 });
        expect(JSON.stringify(responseFormat)).toContain("image-placeholder");
    });

    it("retries a transient HTTP failure and completes from a fragmented stream", async () => {
        const fetchMock = mock()
            .mockResolvedValueOnce(new Response("busy", { status: 503 }))
            .mockResolvedValueOnce(openRouterResponse(validDeck(), 37));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const events = await collectGenerationEvents(new AIService());

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(events.map((event) => event.event)).toEqual([
            "start",
            "retry",
            "theme",
            "slide",
            "complete",
        ]);
        const complete = events.find((event) => event.event === "complete");
        expect(complete?.data.slides).toHaveLength(1);
        expect(complete?.data.schemaVersion).toBe(2);
        expect(complete?.data.theme).toBe("corporate-blue");
        expect(complete?.data.tokens_used).toBe(42);
    });

    it("discards an incomplete attempt before retrying the whole deck", async () => {
        const incompleteDeck = JSON.stringify({ theme: "minimalist", slides: [] });
        const fetchMock = mock()
            .mockResolvedValueOnce(openRouterResponse(incompleteDeck))
            .mockResolvedValueOnce(openRouterResponse(validDeck("Recovered Deck")));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const events = await collectGenerationEvents(new AIService());

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(events.filter((event) => event.event === "retry")).toHaveLength(1);
        const complete = events.find((event) => event.event === "complete");
        const recoveredSlide = complete?.data.slides[0];
        expect(recoveredSlide && "title" in recoveredSlide ? recoveredSlide.title : "").toBe(
            "Recovered Deck"
        );
        expect(events.at(-1)?.event).toBe("complete");
    });

    it("preserves a complete deck when the connection drops after every slide", async () => {
        const fetchMock = mock()
            .mockResolvedValueOnce(interruptedOpenRouterResponse(validDeck("Discarded Deck")))
            .mockResolvedValueOnce(openRouterResponse(validDeck("Final Deck")));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const events = await collectGenerationEvents(new AIService());
        const eventNames = events.map((event) => event.event);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(eventNames).not.toContain("retry");
        const complete = events.find((event) => event.event === "complete");
        const finalSlide = complete?.data.slides[0];
        expect(finalSlide && "title" in finalSlide ? finalSlide.title : "").toBe("Discarded Deck");
    });

    it("trims model overproduction without retrying or streaming surplus slides", async () => {
        const deck = JSON.stringify({
            schemaVersion: 2,
            theme: "minimalist",
            slides: [
                {
                    id: "slide-1",
                    type: "content",
                    layout: "title",
                    title: "Requested",
                    subtitle: "",
                    blocks: [],
                },
                {
                    id: "slide-2",
                    type: "content",
                    layout: "title",
                    title: "Surplus",
                    subtitle: "",
                    blocks: [],
                },
            ],
        });
        const fetchMock = mock().mockResolvedValueOnce(openRouterResponse(deck));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const events = await collectGenerationEvents(new AIService());
        const complete = events.find((event) => event.event === "complete");

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(events.filter((event) => event.event === "retry")).toHaveLength(0);
        expect(events.filter((event) => event.event === "slide")).toHaveLength(1);
        expect(complete?.data.slides).toHaveLength(1);
    });
});
