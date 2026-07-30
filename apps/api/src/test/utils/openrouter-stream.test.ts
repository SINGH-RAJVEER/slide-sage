import { describe, expect, it, mock } from "bun:test";
import {
    OpenRouterStreamError,
    readOpenRouterStream,
    requestOpenRouterStream,
} from "../../utils/openrouter-stream";

function responseFromBytes(parts: Uint8Array[]): Response {
    return new Response(
        new ReadableStream<Uint8Array>({
            start(controller) {
                for (const part of parts) {
                    controller.enqueue(part);
                }
                controller.close();
            },
        })
    );
}

describe("OpenRouter streaming utilities", () => {
    it("parses SSE events split across arbitrary byte and Unicode boundaries", async () => {
        const encoder = new TextEncoder();
        const event = JSON.stringify({ choices: [{ delta: { content: "Deck café" } }] });
        const bytes = encoder.encode(`: processing\r\ndata: ${event}\r\n\r\ndata: [DONE]\r\n\r\n`);
        const response = responseFromBytes([
            bytes.slice(0, 7),
            bytes.slice(7, 29),
            bytes.slice(29, 48),
            bytes.slice(48, 52),
            bytes.slice(52),
        ]);

        const chunks = [];
        for await (const chunk of readOpenRouterStream(response, {
            idleTimeoutMs: 100,
            maxResponseBytes: 1024,
        })) {
            chunks.push(chunk);
        }

        expect(chunks).toHaveLength(1);
        expect(chunks[0]?.choices?.[0]?.delta?.content).toBe("Deck café");
    });

    it("allows delayed chunks that arrive before the idle timeout", async () => {
        const encoder = new TextEncoder();
        let sent = false;
        const response = new Response(
            new ReadableStream<Uint8Array>({
                async pull(controller) {
                    if (sent) {
                        controller.close();
                        return;
                    }
                    sent = true;
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`
                        )
                    );
                },
            })
        );

        const chunks = [];
        for await (const chunk of readOpenRouterStream(response, {
            idleTimeoutMs: 100,
            maxResponseBytes: 1024,
        })) {
            chunks.push(chunk);
        }

        expect(chunks[0]?.choices?.[0]?.delta?.content).toBe("ok");
    });

    it("fails a stream that remains idle past the configured timeout", async () => {
        const response = new Response(
            new ReadableStream<Uint8Array>({
                pull() {
                    return new Promise(() => undefined);
                },
            })
        );

        const consume = async () => {
            for await (const _chunk of readOpenRouterStream(response, {
                idleTimeoutMs: 10,
                maxResponseBytes: 1024,
            })) {
                // No chunks are expected.
            }
        };

        await expect(consume()).rejects.toThrow("idle for 10ms");
    });

    it("requests structured output from compatible fallback providers", async () => {
        let requestBody: Record<string, unknown> | undefined;
        const fetchImpl = mock((_url: string | URL | Request, init?: RequestInit) => {
            requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
            return Promise.resolve(responseFromBytes([]));
        }) as unknown as typeof fetch;

        await requestOpenRouterStream(
            {
                endpoint: "https://openrouter.example.test",
                apiKey: "test-key",
                model: "test-model",
                messages: [{ role: "user", content: "test" }],
                requestTimeoutMs: 100,
                maxTokens: 8192,
                responseFormat: { type: "json_schema", json_schema: { name: "presentation" } },
            },
            fetchImpl
        );

        expect(requestBody?.["max_tokens"]).toBe(8192);
        expect(requestBody?.["response_format"]).toEqual({
            type: "json_schema",
            json_schema: { name: "presentation" },
        });
        expect(requestBody?.["provider"]).toEqual({
            allow_fallbacks: true,
            require_parameters: true,
        });
    });

    it("classifies rate limits as retryable and honors Retry-After", async () => {
        const fetchImpl = mock(() =>
            Promise.resolve(
                new Response("busy", {
                    status: 429,
                    headers: { "Retry-After": "2" },
                })
            )
        ) as unknown as typeof fetch;

        try {
            await requestOpenRouterStream(
                {
                    endpoint: "https://openrouter.example.test",
                    apiKey: "test-key",
                    model: "test-model",
                    messages: [{ role: "user", content: "test" }],
                    requestTimeoutMs: 100,
                    maxTokens: 4096,
                    responseFormat: { type: "json_object" },
                },
                fetchImpl
            );
            throw new Error("Expected request to fail");
        } catch (error) {
            expect(error).toBeInstanceOf(OpenRouterStreamError);
            expect((error as OpenRouterStreamError).retryable).toBe(true);
            expect((error as OpenRouterStreamError).retryAfterMs).toBe(2000);
        }
    });

    it("surfaces the provider message from structured errors", async () => {
        const fetchImpl = mock(() =>
            Promise.resolve(
                Response.json(
                    { error: { message: "Free model daily limit reached", code: 429 } },
                    { status: 429 }
                )
            )
        ) as unknown as typeof fetch;

        const request = requestOpenRouterStream(
            {
                endpoint: "https://openrouter.example.test",
                apiKey: "test-key",
                model: "test-model",
                messages: [{ role: "user", content: "test" }],
                requestTimeoutMs: 100,
                maxTokens: 4096,
                responseFormat: { type: "json_object" },
            },
            fetchImpl
        );

        await expect(request).rejects.toThrow("Free model daily limit reached");
    });
});
