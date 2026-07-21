import type { OpenRouterMessage } from "@slide-sage/types";
import type { StreamChunk } from "./stream-processor";

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export interface OpenRouterRequestOptions {
    endpoint: string;
    apiKey: string;
    model: string;
    messages: OpenRouterMessage[];
    requestTimeoutMs: number;
    maxTokens: number;
    responseFormat: Record<string, unknown>;
}

export interface OpenRouterStreamOptions {
    idleTimeoutMs: number;
    maxResponseBytes: number;
}

export class OpenRouterStreamError extends Error {
    readonly retryable: boolean;
    readonly retryAfterMs?: number;

    constructor(message: string, retryable = true, retryAfterMs?: number) {
        super(message);
        this.name = "OpenRouterStreamError";
        this.retryable = retryable;
        this.retryAfterMs = retryAfterMs;
    }
}

function parseRetryAfter(value: string | null): number | undefined {
    if (!value) return undefined;

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1000;
    }

    const retryAt = Date.parse(value);
    if (!Number.isNaN(retryAt)) {
        return Math.max(0, retryAt - Date.now());
    }

    return undefined;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export async function requestOpenRouterStream(
    options: OpenRouterRequestOptions,
    fetchImpl: typeof fetch = fetch
): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.requestTimeoutMs);
    const baseUrl = (process.env as { BASE_URL?: string }).BASE_URL;

    try {
        const response = await fetchImpl(options.endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${options.apiKey}`,
                "HTTP-Referer": baseUrl || "http://localhost:8000",
                "X-OpenRouter-Title": "Slide Sage",
            },
            body: JSON.stringify({
                model: options.model,
                messages: options.messages,
                stream: true,
                stream_options: { include_usage: true },
                max_tokens: options.maxTokens,
                response_format: options.responseFormat,
                provider: {
                    allow_fallbacks: true,
                    require_parameters: true,
                },
            }),
            signal: controller.signal,
        });

        if (response.ok) {
            return response;
        }

        const responseText = (await response.text()).slice(0, 2000);
        const retryable = RETRYABLE_STATUS_CODES.has(response.status);
        const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
        throw new OpenRouterStreamError(
            `OpenRouter returned ${response.status}: ${responseText || response.statusText}`,
            retryable,
            retryAfterMs
        );
    } catch (error) {
        if (error instanceof OpenRouterStreamError) {
            throw error;
        }

        if (controller.signal.aborted) {
            throw new OpenRouterStreamError(
                `OpenRouter did not start responding within ${options.requestTimeoutMs}ms`
            );
        }

        throw new OpenRouterStreamError(`OpenRouter request failed: ${errorMessage(error)}`);
    } finally {
        clearTimeout(timeout);
    }
}

async function readWithTimeout(reader: ReadableStreamDefaultReader<Uint8Array>, timeoutMs: number) {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            reader.read(),
            new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(
                    () =>
                        reject(
                            new OpenRouterStreamError(
                                `OpenRouter stream was idle for ${timeoutMs}ms`
                            )
                        ),
                    timeoutMs
                );
            }),
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

function parseEventBlock(block: string): StreamChunk | null {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
        .trim();

    if (!data || data === "[DONE]") {
        return null;
    }

    try {
        const parsed = JSON.parse(data) as StreamChunk & {
            error?: { message?: string; code?: number | string };
        };

        if (parsed.error) {
            const code = Number(parsed.error.code);
            const retryable = !Number.isFinite(code) || RETRYABLE_STATUS_CODES.has(code);
            throw new OpenRouterStreamError(
                parsed.error.message || "OpenRouter returned a streaming error",
                retryable
            );
        }

        return parsed;
    } catch (error) {
        if (error instanceof OpenRouterStreamError) {
            throw error;
        }
        throw new OpenRouterStreamError(
            `OpenRouter sent an invalid streaming event: ${errorMessage(error)}`
        );
    }
}

export async function* readOpenRouterStream(
    response: Response,
    options: OpenRouterStreamOptions
): AsyncGenerator<StreamChunk, void, unknown> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new OpenRouterStreamError("OpenRouter response did not include a body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let totalBytes = 0;
    let parsedEvents = 0;

    try {
        while (true) {
            const { done, value } = await readWithTimeout(reader, options.idleTimeoutMs);
            if (done) break;

            totalBytes += value.byteLength;
            if (totalBytes > options.maxResponseBytes) {
                throw new OpenRouterStreamError(
                    `OpenRouter response exceeded ${options.maxResponseBytes} bytes`,
                    false
                );
            }

            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split(/\r?\n\r?\n/);
            buffer = blocks.pop() || "";

            for (const block of blocks) {
                const chunk = parseEventBlock(block);
                if (chunk) {
                    parsedEvents++;
                    yield chunk;
                }
            }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
            const chunk = parseEventBlock(buffer);
            if (chunk) {
                parsedEvents++;
                yield chunk;
            }
        }

        if (parsedEvents === 0) {
            throw new OpenRouterStreamError("OpenRouter stream ended without any events");
        }
    } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}
