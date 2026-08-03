import { eq, sql } from "drizzle-orm";
import { db, semanticCommands, slideTemplates } from "@/database";
import { DEFAULT_SEMANTIC_COMMANDS, DEFAULT_SLIDE_TEMPLATES } from "./defaults";
import type { GenerateEmbedding } from "./types";

export async function seedDefaultSlideTemplatesIfMissing(
    generateEmbedding: GenerateEmbedding,
    embeddingModel: string
): Promise<void> {
    const [{ count } = { count: 0 }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(slideTemplates)
        .where(eq(slideTemplates.embeddingModel, embeddingModel));

    if (Number(count) > 0) return;

    for (const template of DEFAULT_SLIDE_TEMPLATES) {
        const { embedding, model } = await generateEmbedding(template.templateDescription);
        await db.insert(slideTemplates).values({
            templateName: template.templateName,
            templateDescription: template.templateDescription,
            slideType: template.slideType,
            schemaHint: template.schemaHint,
            embedding,
            embeddingModel: model,
            metadata: { seeded: true },
        });
    }
}

export async function seedDefaultSemanticCommandsIfMissing(
    generateEmbedding: GenerateEmbedding,
    embeddingModel: string
): Promise<void> {
    const [{ count } = { count: 0 }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(semanticCommands)
        .where(eq(semanticCommands.embeddingModel, embeddingModel));

    if (Number(count) > 0) return;

    for (const command of DEFAULT_SEMANTIC_COMMANDS) {
        const { embedding, model } = await generateEmbedding(command.commandText);
        await db.insert(semanticCommands).values({
            commandText: command.commandText,
            intent: command.intent,
            route: command.route,
            embedding,
            embeddingModel: model,
            metadata: { seeded: true },
        });
    }
}
