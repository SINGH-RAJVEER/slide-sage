import type { AIModelDescriptor, AIProvider } from "@slidesage/types";

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
        model: "claude-opus-4-5-20251101",
        label: "Claude Opus 4.5",
        description: "High-quality Claude model with structured output support",
    },
    {
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        label: "Claude Sonnet 4.5",
        description: "Balanced Claude model with structured output support",
        recommended: true,
    },
    {
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        label: "Claude Haiku 4.5",
        description: "Fast Claude model with structured output support",
    },
];

export function modelsForProvider(provider: AIProvider): AIModelDescriptor[] {
    return AI_MODEL_CATALOG.filter((model) => model.provider === provider);
}

export function findAIModel(provider: AIProvider, model: string): AIModelDescriptor | undefined {
    return AI_MODEL_CATALOG.find((entry) => entry.provider === provider && entry.model === model);
}
