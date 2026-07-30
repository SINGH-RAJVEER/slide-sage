import type { AIModelDescriptor, AIProvider } from "@slide-sage/types";

export const DEFAULT_OPENROUTER_MODEL = "google/gemma-4-26b-a4b-it";

export function configuredOpenRouterModel(): string {
    return process.env["OPEN_ROUTER_MODEL"] || DEFAULT_OPENROUTER_MODEL;
}

export const AI_MODEL_CATALOG: AIModelDescriptor[] = [
    {
        provider: "openai",
        model: "gpt-4.1",
        label: "GPT-4.1",
        description: "High-quality OpenAI model",
        recommended: true,
    },
    {
        provider: "openai",
        model: "gpt-4.1-mini",
        label: "GPT-4.1 mini",
        description: "Faster and lower-cost OpenAI model",
    },
    {
        provider: "openai",
        model: "gpt-4o",
        label: "GPT-4o",
        description: "Multimodal OpenAI model",
    },
    {
        provider: "google",
        model: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        description: "Google's highest-quality reasoning model",
    },
    {
        provider: "google",
        model: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        description: "Balanced Gemini model",
        recommended: true,
    },
    {
        provider: "google",
        model: "gemini-2.5-flash-lite",
        label: "Gemini 2.5 Flash Lite",
        description: "Fast and economical Gemini model",
    },
    {
        provider: "anthropic",
        model: "claude-opus-4-1-20250805",
        label: "Claude Opus 4.1",
        description: "Anthropic's highest-quality model",
    },
    {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        label: "Claude Sonnet 4",
        description: "Balanced Claude model",
        recommended: true,
    },
    {
        provider: "anthropic",
        model: "claude-3-5-haiku-20241022",
        label: "Claude 3.5 Haiku",
        description: "Fast and economical Claude model",
    },
];

export function modelsForProvider(provider: AIProvider): AIModelDescriptor[] {
    return AI_MODEL_CATALOG.filter((model) => model.provider === provider);
}

export function findAIModel(provider: AIProvider, model: string): AIModelDescriptor | undefined {
    return AI_MODEL_CATALOG.find((entry) => entry.provider === provider && entry.model === model);
}
