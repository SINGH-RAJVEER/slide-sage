import type { AIModelDescriptor, AIProvider } from "@slidesage/types";
import { abortReason, combineAbortSignal } from "../../utils/abort";

const MAX_PROVIDER_RESPONSE_BYTES = 1024 * 1024;
const MAX_PROVIDER_PAGES = 20;
const MAX_PROVIDER_MODELS = 2000;

export class ProviderValidationError extends Error {
    readonly rejected: boolean;
    readonly incompatible: boolean;

    constructor(
        message: string,
        kind: "rejected" | "incompatible" | "unavailable" = "unavailable"
    ) {
        super(message);
        this.name = "ProviderValidationError";
        this.rejected = kind === "rejected";
        this.incompatible = kind === "incompatible";
    }
}

function modelId(value: string): string | null {
    const normalized = value.trim().replace(/^models\//, "");

    const hasControlCharacter = Array.from(normalized).some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
    });

    if (!normalized || normalized.length > 160 || hasControlCharacter) return null;
    return normalized;
}

function text(value: unknown, fallback: string, maxLength: number): string {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim();
    return normalized ? normalized.slice(0, maxLength) : fallback;
}

function isOpenAITextGenerationModel(id: string): boolean {
    const baseModel = id.startsWith("ft:") ? id.slice(3).split(":", 1)[0] || "" : id;
    if (!/^(?:gpt-(?:4o|4\.1|[5-9](?:[.-]|$))|o[1-9](?:-|$))/i.test(baseModel)) return false;
    return !/(?:audio|realtime|transcri|tts|embedding|moderation|image|search|computer-use)/i.test(
        id
    );
}

function descriptor(
    provider: AIProvider,
    id: string,
    label: unknown,
    description: unknown
): AIModelDescriptor {
    return {
        provider,
        model: id,
        label: text(label, id, 160),
        description: text(description, `${provider} model`, 500),
    };
}

async function readPayload(response: Response): Promise<unknown> {
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_PROVIDER_RESPONSE_BYTES) {
        await response.body?.cancel().catch(() => undefined);
        throw new ProviderValidationError("The provider returned an invalid model catalog.");
    }
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_PROVIDER_RESPONSE_BYTES) {
        throw new ProviderValidationError("The provider returned an invalid model catalog.");
    }
    return JSON.parse(raw) as unknown;
}

async function requestPage(
    url: string,
    headers: HeadersInit,
    signal: AbortSignal,
    fetchImpl: typeof fetch
): Promise<unknown> {
    const response = await fetchImpl(url, {
        headers: { Accept: "application/json", ...headers },
        signal,
    });
    if (response.status === 401 || response.status === 403) {
        throw new ProviderValidationError("The provider rejected this API key.", "rejected");
    }
    if (!response.ok) {
        throw new ProviderValidationError("The provider could not validate this API key.");
    }
    return await readPayload(response);
}

async function openAIModels(
    apiKey: string,
    signal: AbortSignal,
    fetchImpl: typeof fetch
): Promise<AIModelDescriptor[]> {
    const payload = (await requestPage(
        "https://api.openai.com/v1/models",
        { Authorization: `Bearer ${apiKey}` },
        signal,
        fetchImpl
    )) as { data?: Array<{ id?: unknown; created?: unknown }> };
    return (Array.isArray(payload.data) ? payload.data : [])
        .map((entry) => ({ id: modelId(entry.id), created: Number(entry.created ?? 0) }))
        .filter((entry): entry is { id: string; created: number } =>
            Boolean(entry.id && isOpenAITextGenerationModel(entry.id))
        )
        .sort((left, right) => right.created - left.created)
        .map((entry) => descriptor("openai", entry.id, entry.id, "OpenAI text-generation model"));
}

async function googleModels(
    apiKey: string,
    signal: AbortSignal,
    fetchImpl: typeof fetch
): Promise<AIModelDescriptor[]> {
    const models: AIModelDescriptor[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PROVIDER_PAGES; page++) {
        const params = new URLSearchParams({ pageSize: "1000" });
        if (pageToken) params.set("pageToken", pageToken);
        const payload = (await requestPage(
            `https://generativelanguage.googleapis.com/v1beta/models?${params}`,
            { "x-goog-api-key": apiKey },
            signal,
            fetchImpl
        )) as {
            models?: Array<{
                name?: unknown;
                baseModelId?: unknown;
                displayName?: unknown;
                description?: unknown;
                supportedGenerationMethods?: unknown;
            }>;
            nextPageToken?: unknown;
        };
        for (const entry of Array.isArray(payload.models) ? payload.models : []) {
            if (
                !Array.isArray(entry.supportedGenerationMethods) ||
                !entry.supportedGenerationMethods.includes("generateContent")
            ) {
                continue;
            }
            const id = modelId(entry.baseModelId) ?? modelId(entry.name);
            if (!id) continue;
            models.push(descriptor("google", id, entry.displayName, entry.description));
            if (models.length >= MAX_PROVIDER_MODELS) return models;
        }
        pageToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken : undefined;
        if (!pageToken) break;
    }
    return models;
}

async function anthropicModels(
    apiKey: string,
    signal: AbortSignal,
    fetchImpl: typeof fetch
): Promise<AIModelDescriptor[]> {
    const models: AIModelDescriptor[] = [];
    let afterId: string | undefined;
    for (let page = 0; page < MAX_PROVIDER_PAGES; page++) {
        const params = new URLSearchParams({ limit: "1000" });
        if (afterId) params.set("after_id", afterId);
        const payload = (await requestPage(
            `https://api.anthropic.com/v1/models?${params}`,
            {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            signal,
            fetchImpl
        )) as {
            data?: Array<{
                id?: unknown;
                display_name?: unknown;
                capabilities?: { structured_outputs?: { supported?: unknown } };
            }>;
            has_more?: unknown;
            last_id?: unknown;
        };
        for (const entry of Array.isArray(payload.data) ? payload.data : []) {
            if (entry.capabilities?.structured_outputs?.supported !== true) continue;
            const id = modelId(entry.id);
            if (!id) continue;
            models.push(
                descriptor(
                    "anthropic",
                    id,
                    entry.display_name,
                    "Anthropic model with structured output support"
                )
            );
            if (models.length >= MAX_PROVIDER_MODELS) return models;
        }
        if (payload.has_more !== true || typeof payload.last_id !== "string") break;
        afterId = payload.last_id;
    }
    return models;
}

function uniqueModels(models: AIModelDescriptor[]): AIModelDescriptor[] {
    const seen = new Set<string>();
    const unique = models.filter((model) => {
        if (seen.has(model.model)) return false;
        seen.add(model.model);
        return true;
    });
    return unique.map((model, index) => (index === 0 ? { ...model, recommended: true } : model));
}

export async function validateProviderKey(
    provider: AIProvider,
    apiKey: string,
    signal?: AbortSignal,
    fetchImpl: typeof fetch = fetch
): Promise<AIModelDescriptor[]> {
    const configuredTimeout = Number.parseInt(
        process.env["PROVIDER_VALIDATION_TIMEOUT_MS"] ?? "",
        10
    );
    const timeoutMs =
        Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 15_000;
    const combined = combineAbortSignal(signal, timeoutMs, "Provider validation timed out");
    try {
        const models = uniqueModels(
            provider === "openai"
                ? await openAIModels(apiKey, combined.signal, fetchImpl)
                : provider === "google"
                  ? await googleModels(apiKey, combined.signal, fetchImpl)
                  : await anthropicModels(apiKey, combined.signal, fetchImpl)
        );
        if (models.length === 0) {
            throw new ProviderValidationError(
                "This account has no compatible text-generation models.",
                "incompatible"
            );
        }
        return models;
    } catch (error) {
        if (error instanceof ProviderValidationError) throw error;
        if (signal?.aborted) throw abortReason(signal);
        throw new ProviderValidationError("The provider could not be reached. Try again shortly.");
    } finally {
        combined.dispose();
    }
}
