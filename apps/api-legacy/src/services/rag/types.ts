import type { Slide, Source } from "@slidesage/types";

export interface EmbeddingResult {
    embedding: number[];
    model: string;
}

export type MemorySourceType =
    | "search"
    | "iteration"
    | "presentation"
    | "slide"
    | "deck"
    | "source"
    | "prompt"
    | "template"
    | "example"
    | "style"
    | "feedback";

export interface SimilarContext {
    context: string;
    similarity: number;
    sourceType: MemorySourceType;
    sourceId?: string;
    metadata?: Record<string, unknown>;
}

export interface StorePresentationSemanticMemoryParams {
    presentationId: string;
    userId: string;
    prompt: string;
    slides: Slide[];
    title: string;
    theme: string;
    operation: "generation" | "iteration";
    detailLevel?: string;
    tonality?: string;
    sources?: Source[];
}

export interface SemanticTemplateSeed {
    templateName: string;
    templateDescription: string;
    slideType: string;
    schemaHint: Record<string, unknown>;
}

export interface SemanticCommandSeed {
    commandText: string;
    intent: string;
    route: string;
}

export interface RankedSource extends Source {
    similarity: number;
}

export type GenerateEmbedding = (text: string) => Promise<EmbeddingResult>;
export type PromptIntentClassifier = (embedding: number[], prompt: string) => Promise<string>;
