import type { PresentationJSON, ThemeId } from "@slidesage/types";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { generationPointOperations, type Presentation, presentations, users } from "../db/schema";

export class InsufficientGenerationPointsError extends Error {
    readonly balance: number;
    readonly required: number;
    readonly shortfall: number;

    constructor(balance: number, required: number) {
        super("Insufficient points");
        this.name = "InsufficientGenerationPointsError";
        this.balance = balance;
        this.required = required;
        this.shortfall = Math.max(0, required - balance);
    }
}

export class PresentationFinalizationConflictError extends Error {
    constructor() {
        super("Presentation changed while generation was running");
        this.name = "PresentationFinalizationConflictError";
    }
}

interface ReserveNewPresentationInput {
    operationId: string;
    userId: string;
    title: string;
    prompt: string;
    slidesData: PresentationJSON;
    quotedPoints: number;
}

interface ReserveExistingPresentationInput {
    operationId: string;
    userId: string;
    presentationId: string;
    kind: "generation" | "iteration";
    quotedPoints: number;
}

interface FinalizePresentationInput {
    operationId: string;
    userId: string;
    presentationId: string;
    chargedPoints: number;
    expectedRevision?: number;
    updates: Partial<Presentation>;
}

async function reservePoints(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    userId: string,
    quotedPoints: number
) {
    if (quotedPoints === 0) {
        const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user) throw new Error("User not found");
        return user;
    }

    const [user] = await tx
        .update(users)
        .set({
            slideTokens: sql`${users.slideTokens} - ${quotedPoints}`,
            updatedAt: new Date(),
        })
        .where(and(eq(users.id, userId), gte(users.slideTokens, quotedPoints)))
        .returning();

    if (user) return user;

    const [existingUser] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existingUser) throw new Error("User not found");
    throw new InsufficientGenerationPointsError(existingUser.slideTokens, quotedPoints);
}

async function refundExpiredReservations(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    userId: string
): Promise<void> {
    const now = new Date();
    const expired = await tx
        .update(generationPointOperations)
        .set({
            status: "refunded",
            chargedPoints: 0,
            updatedAt: now,
            finalizedAt: now,
        })
        .where(
            and(
                eq(generationPointOperations.userId, userId),
                eq(generationPointOperations.status, "reserved"),
                lte(generationPointOperations.expiresAt, now)
            )
        )
        .returning({
            id: generationPointOperations.id,
            kind: generationPointOperations.kind,
            presentationId: generationPointOperations.presentationId,
            quotedPoints: generationPointOperations.quotedPoints,
        });

    const refund = expired.reduce((total, operation) => total + operation.quotedPoints, 0);
    if (refund <= 0) return;

    const [user] = await tx
        .update(users)
        .set({
            slideTokens: sql`${users.slideTokens} + ${refund}`,
            updatedAt: now,
        })
        .where(eq(users.id, userId))
        .returning();
    if (!user) throw new Error("User not found");

    for (const operation of expired) {
        if (operation.kind !== "generation" || !operation.presentationId) continue;
        const [presentation] = await tx
            .select()
            .from(presentations)
            .where(
                and(
                    eq(presentations.id, operation.presentationId),
                    eq(presentations.userId, userId)
                )
            )
            .limit(1);
        if (!presentation) continue;

        const current = presentation.slidesData as Partial<PresentationJSON>;
        if ((current.slides?.length ?? 0) > 0 || current.status === "ready") continue;
        await tx
            .update(presentations)
            .set({
                title: presentation.prompt.slice(0, 255) || "Failed presentation",
                slidesData: {
                    ...current,
                    title: current.title ?? presentation.title,
                    theme: (current.theme ?? "corporate-blue") as ThemeId,
                    status: "failed",
                    slides: [],
                    failure: {
                        message: "Generation stopped before completion. Please try again.",
                        retry: {
                            prompt: presentation.prompt,
                            slide_count: 5,
                            detail_level: "balanced",
                            tonality: "professional",
                            research_enabled: false,
                            theme: (current.theme ?? "corporate-blue") as ThemeId,
                        },
                    },
                } satisfies PresentationJSON,
                revision: sql`${presentations.revision} + 1`,
                updatedAt: now,
            })
            .where(
                and(
                    eq(presentations.id, presentation.id),
                    eq(presentations.userId, userId),
                    eq(presentations.revision, presentation.revision)
                )
            );
    }

    for (const operation of expired) {
        await tx
            .update(generationPointOperations)
            .set({ balanceAfter: user.slideTokens, updatedAt: now })
            .where(eq(generationPointOperations.id, operation.id));
    }
}

export class GenerationPointOperationRepository {
    async getBalance(userId: string): Promise<number> {
        return await db.transaction(async (tx) => {
            await refundExpiredReservations(tx, userId);
            const [user] = await tx
                .select({ slideTokens: users.slideTokens })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);
            if (!user) throw new Error("User not found");
            return user.slideTokens;
        });
    }

    async reserveNewPresentation(
        input: ReserveNewPresentationInput
    ): Promise<{ presentation: Presentation; balance: number }> {
        return await db.transaction(async (tx) => {
            await refundExpiredReservations(tx, input.userId);
            const user = await reservePoints(tx, input.userId, input.quotedPoints);
            const [presentation] = await tx
                .insert(presentations)
                .values({
                    userId: input.userId,
                    title: input.title,
                    prompt: input.prompt,
                    slidesData: input.slidesData,
                })
                .returning();
            if (!presentation) throw new Error("Failed to create presentation");

            await tx.insert(generationPointOperations).values({
                id: input.operationId,
                userId: input.userId,
                presentationId: presentation.id,
                kind: "generation",
                quotedPoints: input.quotedPoints,
                expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            });

            return { presentation, balance: user.slideTokens };
        });
    }

    async reserveExistingPresentation(
        input: ReserveExistingPresentationInput
    ): Promise<{ balance: number }> {
        return await db.transaction(async (tx) => {
            await refundExpiredReservations(tx, input.userId);
            const [presentation] = await tx
                .select({ id: presentations.id })
                .from(presentations)
                .where(
                    and(
                        eq(presentations.id, input.presentationId),
                        eq(presentations.userId, input.userId)
                    )
                )
                .limit(1);
            if (!presentation) throw new Error("Presentation not found");

            const user = await reservePoints(tx, input.userId, input.quotedPoints);
            await tx.insert(generationPointOperations).values({
                id: input.operationId,
                userId: input.userId,
                presentationId: input.presentationId,
                kind: input.kind,
                quotedPoints: input.quotedPoints,
                expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            });
            return { balance: user.slideTokens };
        });
    }

    async finalizePresentation(
        input: FinalizePresentationInput
    ): Promise<{ presentation: Presentation; balance: number }> {
        return await db.transaction(async (tx) => {
            const now = new Date();
            const [operation] = await tx
                .update(generationPointOperations)
                .set({
                    status: "settled",
                    chargedPoints: input.chargedPoints,
                    updatedAt: now,
                    finalizedAt: now,
                })
                .where(
                    and(
                        eq(generationPointOperations.id, input.operationId),
                        eq(generationPointOperations.userId, input.userId),
                        eq(generationPointOperations.presentationId, input.presentationId),
                        eq(generationPointOperations.status, "reserved"),
                        gte(generationPointOperations.quotedPoints, input.chargedPoints)
                    )
                )
                .returning();
            if (!operation) throw new Error("Generation point reservation is not active");

            const revisionCondition =
                input.expectedRevision !== undefined
                    ? eq(presentations.revision, input.expectedRevision)
                    : undefined;
            const [presentation] = await tx
                .update(presentations)
                .set({
                    ...input.updates,
                    revision: sql`${presentations.revision} + 1`,
                    updatedAt: now,
                })
                .where(
                    and(
                        eq(presentations.id, input.presentationId),
                        eq(presentations.userId, input.userId),
                        revisionCondition
                    )
                )
                .returning();
            if (!presentation) throw new PresentationFinalizationConflictError();

            const refund = operation.quotedPoints - input.chargedPoints;
            const [user] =
                refund > 0
                    ? await tx
                          .update(users)
                          .set({
                              slideTokens: sql`${users.slideTokens} + ${refund}`,
                              updatedAt: now,
                          })
                          .where(eq(users.id, input.userId))
                          .returning()
                    : await tx.select().from(users).where(eq(users.id, input.userId)).limit(1);
            if (!user) throw new Error("User not found");

            await tx
                .update(generationPointOperations)
                .set({ balanceAfter: user.slideTokens, updatedAt: now })
                .where(eq(generationPointOperations.id, input.operationId));

            return { presentation, balance: user.slideTokens };
        });
    }

    async refund(operationId: string, userId: string): Promise<number> {
        return await db.transaction(async (tx) => {
            const now = new Date();
            const [operation] = await tx
                .update(generationPointOperations)
                .set({ status: "refunded", updatedAt: now, finalizedAt: now })
                .where(
                    and(
                        eq(generationPointOperations.id, operationId),
                        eq(generationPointOperations.userId, userId),
                        eq(generationPointOperations.status, "reserved")
                    )
                )
                .returning();

            if (!operation) {
                const [existing] = await tx
                    .select()
                    .from(generationPointOperations)
                    .where(
                        and(
                            eq(generationPointOperations.id, operationId),
                            eq(generationPointOperations.userId, userId)
                        )
                    )
                    .limit(1);
                if (existing?.status === "refunded" && existing.balanceAfter !== null) {
                    return existing.balanceAfter;
                }
                throw new Error("Generation point reservation cannot be refunded");
            }

            const [user] =
                operation.quotedPoints > 0
                    ? await tx
                          .update(users)
                          .set({
                              slideTokens: sql`${users.slideTokens} + ${operation.quotedPoints}`,
                              updatedAt: now,
                          })
                          .where(eq(users.id, userId))
                          .returning()
                    : await tx.select().from(users).where(eq(users.id, userId)).limit(1);
            if (!user) throw new Error("User not found");

            await tx
                .update(generationPointOperations)
                .set({ balanceAfter: user.slideTokens, updatedAt: now })
                .where(eq(generationPointOperations.id, operationId));
            return user.slideTokens;
        });
    }

    async renew(operationId: string, userId: string): Promise<void> {
        await db
            .update(generationPointOperations)
            .set({
                expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(generationPointOperations.id, operationId),
                    eq(generationPointOperations.userId, userId),
                    eq(generationPointOperations.status, "reserved")
                )
            );
    }
}
