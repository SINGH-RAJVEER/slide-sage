import type { AIModelDescriptor, AIProvider } from "@slide-sage/types";
import { modelsForProvider } from "./model-catalog";

export class ProviderValidationError extends Error {
    readonly rejected: boolean;

    constructor(message: string, rejected = false) {
        super(message);
        this.name = "ProviderValidationError";
        this.rejected = rejected;
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
    apiKey: string
): Promise<AIModelDescriptor[]> {
    const [url, headers] = providerRequest(provider, apiKey);
    let response: Response;
    try {
        response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    } catch {
        throw new ProviderValidationError("The provider could not be reached. Try again shortly.");
    }
    if (response.status === 401 || response.status === 403) {
        throw new ProviderValidationError("The provider rejected this API key.", true);
    }
    if (!response.ok) {
        throw new ProviderValidationError("The provider could not validate this API key.");
    }
    const available = extractModelIds(provider, await response.json().catch(() => ({})));
    return modelsForProvider(provider).filter((model) => available.has(model.model));
}
