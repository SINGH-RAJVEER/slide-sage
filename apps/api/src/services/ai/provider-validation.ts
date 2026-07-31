import type { AIModelDescriptor, AIProvider } from "@slidesage/types";
import { abortReason, combineAbortSignal } from "../../utils/abort";
import { modelsForProvider } from "./model-catalog";

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

function providerRequest(provider: AIProvider, apiKey: string): [string, HeadersInit] {
    if (provider === "openai") {
        return ["https://api.openai.com/v1/models", { Authorization: `Bearer ${apiKey}` }];
    }
    if (provider === "google") {
        return [
            "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
            { "x-goog-api-key": apiKey },
        ];
    }
    return [
        "https://api.anthropic.com/v1/models?limit=1000",
        { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    ];
}

function extractModelIds(provider: AIProvider, payload: unknown): Set<string> {
    if (!payload || typeof payload !== "object") return new Set();
    const value = payload as { data?: Array<{ id?: string }>; models?: Array<{ name?: string }> };
    if (provider === "google") {
        return new Set(
            (value.models || [])
                .map((model) => model.name?.replace(/^models\//, ""))
                .filter((id): id is string => Boolean(id))
        );
    }
    return new Set(
        (value.data || []).map((model) => model.id).filter((id): id is string => Boolean(id))
    );
}

export async function validateProviderKey(
    provider: AIProvider,
    apiKey: string,
    signal?: AbortSignal,
    fetchImpl: typeof fetch = fetch
): Promise<AIModelDescriptor[]> {
    const [url, headers] = providerRequest(provider, apiKey);
    const configuredTimeout = Number.parseInt(
        process.env["PROVIDER_VALIDATION_TIMEOUT_MS"] ?? "",
        10
    );
    const timeoutMs =
        Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 15_000;
    const combined = combineAbortSignal(signal, timeoutMs, "Provider validation timed out");
    try {
        const response = await fetchImpl(url, { headers, signal: combined.signal });
        if (response.status === 401 || response.status === 403) {
            throw new ProviderValidationError("The provider rejected this API key.", "rejected");
        }
        if (!response.ok) {
            throw new ProviderValidationError("The provider could not validate this API key.");
        }
        const available = extractModelIds(provider, await response.json().catch(() => ({})));
        const compatible = modelsForProvider(provider).filter((model) =>
            available.has(model.model)
        );
        if (compatible.length === 0) {
            throw new ProviderValidationError(
                "This account has no supported structured-output models.",
                "incompatible"
            );
        }
        return compatible;
    } catch (error) {
        if (error instanceof ProviderValidationError) throw error;
        if (signal?.aborted) throw abortReason(signal);
        throw new ProviderValidationError("The provider could not be reached. Try again shortly.");
    } finally {
        combined.dispose();
    }
}
