import {
    db,
    deckMemories,
    exampleGenerations,
    feedbackMemories,
    presentationEmbeddings,
    promptEvents,
    searchEmbeddings,
    semanticCommands,
    slideEmbeddings,
    slideTemplates,
    sourceChunks,
    styleMemories,
} from "@slide-sage/database";
import { and, cosineDistance, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { SimilarContext } from "./types";
import { contextFromRow } from "./utils";

export async function retrieveSearchContexts(
    userId: string,
    embedding: number[],
    limit: number,
    threshold: number
): Promise<SimilarContext[]> {
    const similarity = sql<number>`1 - (${cosineDistance(searchEmbeddings.embedding, embedding)})`;
    const rows = await db
        .select({
            id: searchEmbeddings.id,
            context: searchEmbeddings.searchQuery,
            similarity,
            metadata: searchEmbeddings.metadata,
        })
        .from(searchEmbeddings)
        .where(and(eq(searchEmbeddings.userId, userId), sql`${similarity} > ${threshold}`))
        .orderBy(desc(similarity))
        .limit(limit);

    return rows.map((row) =>
        contextFromRow("search", row.id, row.context, row.similarity, row.metadata)
    );
}

export async function retrieveIterationContexts(
    userId: string,
    presentationId: string,
    embedding: number[],
    limit: number,
    threshold: number
): Promise<SimilarContext[]> {
    const similarity = sql<number>`1 - (${cosineDistance(
        presentationEmbeddings.embedding,
        embedding
    )})`;
    const rows = await db
        .select({
            id: presentationEmbeddings.id,
            prompt: presentationEmbeddings.iterationPrompt,
            content: presentationEmbeddings.presentationContent,
            similarity,
            metadata: presentationEmbeddings.metadata,
        })
        .from(presentationEmbeddings)
        .where(
            and(
                eq(presentationEmbeddings.userId, userId),
                eq(presentationEmbeddings.presentationId, presentationId),
                sql`${similarity} > ${threshold}`
            )
        )
        .orderBy(desc(similarity))
        .limit(limit);

    return rows.map((row) =>
        contextFromRow(
            "iteration",
            row.id,
            `${row.prompt}\n${row.content ?? ""}`.trim(),
            row.similarity,
            row.metadata
        )
    );
}

export async function retrieveSlideContexts(
    userId: string,
    presentationId: string,
    embedding: number[],
    limit: number,
    threshold: number
): Promise<SimilarContext[]> {
    const similarity = sql<number>`1 - (${cosineDistance(slideEmbeddings.embedding, embedding)})`;
    const rows = await db
        .select({
            id: slideEmbeddings.id,
            context: slideEmbeddings.summary,
            similarity,
            metadata: slideEmbeddings.metadata,
        })
        .from(slideEmbeddings)
        .where(
            and(
                eq(slideEmbeddings.userId, userId),
                eq(slideEmbeddings.presentationId, presentationId),
                sql`${similarity} > ${threshold}`
            )
        )
        .orderBy(desc(similarity))
        .limit(limit);

    return rows.map((row) =>
        contextFromRow("slide", row.id, row.context, row.similarity, row.metadata)
    );
}

export async function retrieveDeckContexts(
    userId: string,
    presentationId: string,
    embedding: number[],
    limit: number,
    threshold: number
): Promise<SimilarContext[]> {
    const similarity = sql<number>`1 - (${cosineDistance(deckMemories.embedding, embedding)})`;
    const rows = await db
        .select({
            id: deckMemories.id,
            context: deckMemories.content,
            similarity,
            metadata: deckMemories.metadata,
        })
        .from(deckMemories)
        .where(
            and(
                eq(deckMemories.userId, userId),
                eq(deckMemories.presentationId, presentationId),
                sql`${similarity} > ${threshold}`
            )
        )
        .orderBy(desc(similarity))
        .limit(limit);

    return rows.map((row) =>
        contextFromRow("deck", row.id, row.context, row.similarity, row.metadata)
    );
}

export async function retrievePromptContexts(
    userId: string,
    presentationId: string,
    embedding: number[],
    limit: number,
    threshold: number
): Promise<SimilarContext[]> {
    const similarity = sql<number>`1 - (${cosineDistance(promptEvents.embedding, embedding)})`;
    const rows = await db
        .select({
            id: promptEvents.id,
            prompt: promptEvents.userPrompt,
            intent: promptEvents.interpretedIntent,
            similarity,
            metadata: promptEvents.metadata,
        })
        .from(promptEvents)
        .where(
            and(
                eq(promptEvents.userId, userId),
                eq(promptEvents.presentationId, presentationId),
                sql`${similarity} > ${threshold}`
            )
        )
        .orderBy(desc(similarity))
        .limit(limit);

    return rows.map((row) =>
        contextFromRow(
            "prompt",
            row.id,
            `Prompt intent: ${row.intent}\nUser prompt: ${row.prompt}`,
            row.similarity,
            row.metadata
        )
    );
}

export async function retrieveSourceContexts(
    userId: string,
    presentationId: string,
    embedding: number[],
    limit: number,
    threshold: number
): Promise<SimilarContext[]> {
    const similarity = sql<number>`1 - (${cosineDistance(sourceChunks.embedding, embedding)})`;
    const rows = await db
        .select({
            id: sourceChunks.id,
            context: sourceChunks.chunkText,
            similarity,
            metadata: sourceChunks.metadata,
        })
        .from(sourceChunks)
        .where(
            and(
                eq(sourceChunks.userId, userId),
                or(
                    eq(sourceChunks.presentationId, presentationId),
                    isNull(sourceChunks.presentationId)
                ),
                sql`${similarity} > ${threshold}`
            )
        )
        .orderBy(desc(similarity))
        .limit(limit);

    return rows.map((row) =>
        contextFromRow("source", row.id, row.context, row.similarity, row.metadata)
    );
}

export async function retrieveTemplateContexts(
    embeddingModel: string,
    embedding: number[],
    limit: number,
    threshold: number
): Promise<SimilarContext[]> {
    const similarity = sql<number>`1 - (${cosineDistance(slideTemplates.embedding, embedding)})`;
    const rows = await db
        .select({
            id: slideTemplates.id,
            name: slideTemplates.templateName,
            description: slideTemplates.templateDescription,
            slideType: slideTemplates.slideType,
            similarity,
            metadata: slideTemplates.metadata,
        })
        .from(slideTemplates)
        .where(
            and(
                eq(slideTemplates.embeddingModel, embeddingModel),
                sql`${similarity} > ${threshold}`
            )
        )
        .orderBy(desc(similarity))
        .limit(limit);

    return rows.map((row) =>
        contextFromRow(
            "template",
            row.id,
            `Template: ${row.name}\nSlide type: ${row.slideType}\nUse when: ${row.description}`,
            row.similarity,
            row.metadata
        )
    );
}

export async function retrieveExampleContexts(
    userId: string,
    embedding: number[],
    limit: number,
    threshold: number
): Promise<SimilarContext[]> {
    const similarity = sql<number>`1 - (${cosineDistance(exampleGenerations.embedding, embedding)})`;
    const rows = await db
        .select({
            id: exampleGenerations.id,
            prompt: exampleGenerations.prompt,
            summary: exampleGenerations.summary,
            similarity,
            metadata: exampleGenerations.metadata,
        })
        .from(exampleGenerations)
        .where(and(eq(exampleGenerations.userId, userId), sql`${similarity} > ${threshold}`))
        .orderBy(desc(similarity))
        .limit(limit);

    return rows.map((row) =>
        contextFromRow(
            "example",
            row.id,
            `Similar successful prompt: ${row.prompt}\nResult summary: ${row.summary}`,
            row.similarity,
            row.metadata
        )
    );
}

export async function retrieveStyleContexts(
    userId: string,
    presentationId: string | undefined,
    embedding: number[],
    limit: number,
    threshold: number
): Promise<SimilarContext[]> {
    const similarity = sql<number>`1 - (${cosineDistance(styleMemories.embedding, embedding)})`;
    const presentationFilter = presentationId
        ? or(eq(styleMemories.presentationId, presentationId), isNull(styleMemories.presentationId))
        : undefined;
    const rows = await db
        .select({
            id: styleMemories.id,
            context: styleMemories.content,
            similarity,
            metadata: styleMemories.metadata,
        })
        .from(styleMemories)
        .where(
            presentationFilter
                ? and(
                      eq(styleMemories.userId, userId),
                      presentationFilter,
                      sql`${similarity} > ${threshold}`
                  )
                : and(eq(styleMemories.userId, userId), sql`${similarity} > ${threshold}`)
        )
        .orderBy(desc(similarity))
        .limit(limit);

    return rows.map((row) =>
        contextFromRow("style", row.id, row.context, row.similarity, row.metadata)
    );
}

export async function retrieveFeedbackContexts(
    userId: string,
    presentationId: string,
    embedding: number[],
    limit: number,
    threshold: number
): Promise<SimilarContext[]> {
    const similarity = sql<number>`1 - (${cosineDistance(feedbackMemories.embedding, embedding)})`;
    const rows = await db
        .select({
            id: feedbackMemories.id,
            feedback: feedbackMemories.feedbackText,
            outcome: feedbackMemories.outcome,
            similarity,
            metadata: feedbackMemories.metadata,
        })
        .from(feedbackMemories)
        .where(
            and(
                eq(feedbackMemories.userId, userId),
                eq(feedbackMemories.presentationId, presentationId),
                sql`${similarity} > ${threshold}`
            )
        )
        .orderBy(desc(similarity))
        .limit(limit);

    return rows.map((row) =>
        contextFromRow(
            "feedback",
            row.id,
            `Prior feedback (${row.outcome}): ${row.feedback}`,
            row.similarity,
            row.metadata
        )
    );
}

export async function retrieveBestSemanticCommandIntent(
    embeddingModel: string,
    embedding: number[]
): Promise<{ intent: string; similarity: number } | undefined> {
    const similarity = sql<number>`1 - (${cosineDistance(semanticCommands.embedding, embedding)})`;
    const [match] = await db
        .select({
            intent: semanticCommands.intent,
            similarity,
        })
        .from(semanticCommands)
        .where(eq(semanticCommands.embeddingModel, embeddingModel))
        .orderBy(desc(similarity))
        .limit(1);

    return match;
}
