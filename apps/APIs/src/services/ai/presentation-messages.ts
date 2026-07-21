import { buildResearchSystemMessage, type OpenRouterMessage, type Source } from "@slide-sage/types";

interface GenerationMessageParams {
    systemPrompt: string;
    generationMemoryContext: string;
    researchSources: Source[];
    userPrompt: string;
    slideCount: number;
}

interface IterationMessageParams {
    systemPrompt: string;
    researchSources: Source[];
    feedback: string;
}

export function buildGenerationMessages(params: GenerationMessageParams): OpenRouterMessage[] {
    const messages: OpenRouterMessage[] = [{ role: "system", content: params.systemPrompt }];

    if (params.generationMemoryContext) {
        messages.push({ role: "system", content: params.generationMemoryContext });
    }
    if (params.researchSources.length) {
        messages.push({
            role: "system",
            content: buildResearchSystemMessage(params.researchSources, params.userPrompt),
        });
    }
    messages.push({
        role: "user",
        content: `Create a comprehensive presentation with data visualizations about: ${params.userPrompt} in ${params.slideCount} slides.`,
    });

    return messages;
}

export function buildIterationMessages(params: IterationMessageParams): OpenRouterMessage[] {
    const messages: OpenRouterMessage[] = [{ role: "system", content: params.systemPrompt }];

    if (params.researchSources.length) {
        messages.push({
            role: "system",
            content: buildResearchSystemMessage(params.researchSources, params.feedback),
        });
    }
    messages.push({
        role: "user",
        content: `Apply the following changes to the presentation: ${params.feedback}`,
    });

    return messages;
}
