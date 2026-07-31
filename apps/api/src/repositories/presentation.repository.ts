import type { PresentationJSON } from "@slidesage/types";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { type Presentation, presentations } from "../db/schema";

export class PresentationRepository {
    async create(
        userId: string,
        title: string,
        prompt: string,
        slidesData: PresentationJSON
    ): Promise<Presentation> {
        const [presentation] = await db
            .insert(presentations)
            .values({
                userId,
                title,
                prompt,
                slidesData,
            })
            .returning();

        if (!presentation) {
            throw new Error("Failed to create presentation");
        }

        return presentation;
    }

    async findById(presentationId: string): Promise<Presentation | undefined> {
        const [presentation] = await db
            .select()
            .from(presentations)
            .where(eq(presentations.id, presentationId));

        return presentation;
    }

    async findByUserId(
        userId: string,
        limit = 20,
        offset = 0
    ): Promise<{
        presentations: Presentation[];
        total: number;
        hasMore: boolean;
    }> {
        // Get total count
        const [countResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(presentations)
            .where(eq(presentations.userId, userId));

        const total = Number(countResult?.count ?? 0);

        // Get paginated results
        const userPresentations = await db
            .select()
            .from(presentations)
            .where(eq(presentations.userId, userId))
            .orderBy(desc(presentations.createdAt), desc(presentations.id))
            .limit(limit)
            .offset(offset);

        return {
            presentations: userPresentations,
            total,
            hasMore: offset + userPresentations.length < total,
        };
    }

    async delete(presentationId: string): Promise<void> {
        await db.delete(presentations).where(eq(presentations.id, presentationId));
    }

    async update(
        presentationId: string,
        updates: Partial<Presentation>
    ): Promise<Presentation | undefined> {
        const [presentation] = await db
            .update(presentations)
            .set({
                ...updates,
                revision: sql`${presentations.revision} + 1`,
                updatedAt: new Date(),
            })
            .where(eq(presentations.id, presentationId))
            .returning();

        return presentation;
    }

    async updateOwnedAtRevision(
        presentationId: string,
        userId: string,
        expectedRevision: number,
        updates: Partial<Presentation>
    ): Promise<Presentation | undefined> {
        const [presentation] = await db
            .update(presentations)
            .set({
                ...updates,
                revision: sql`${presentations.revision} + 1`,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(presentations.id, presentationId),
                    eq(presentations.userId, userId),
                    eq(presentations.revision, expectedRevision)
                )
            )
            .returning();

        return presentation;
    }

    async findIterations(presentationId: string): Promise<Presentation[]> {
        const iterations = await db
            .select()
            .from(presentations)
            .where(eq(presentations.parentPresentationId, presentationId))
            .orderBy(desc(presentations.createdAt), desc(presentations.id));

        return iterations;
    }
}
