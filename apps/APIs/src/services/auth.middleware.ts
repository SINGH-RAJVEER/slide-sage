import { db, users } from "@slide-sage/database";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { createAuth } from "./auth";

async function getSessionFromCookie(
    c: Context
): Promise<{ userId: string; sessionId: string } | null> {
    const auth = createAuth(c.env);
    const sessionData = await auth.api.getSession({
        headers: c.req.raw.headers,
    });

    if (!sessionData?.session || !sessionData?.user) {
        return null;
    }

    return {
        userId: sessionData.user.id,
        sessionId: sessionData.session.id,
    };
}

export async function authMiddleware(
    c: Context,
    next: () => Promise<void>
): Promise<Response | undefined> {
    const auth = await getSessionFromCookie(c);

    if (!auth) {
        return c.json({ error: { message: "Unauthorized" } }, 401);
    }

    c.set("userId", auth.userId);
    c.set("sessionId", auth.sessionId);

    await next();
}

export function getCurrentUserId(c: Context): string {
    const userId = c.get("userId");
    if (!userId) {
        throw new Error("User not authenticated");
    }
    return userId;
}

export function getCurrentSessionId(c: Context): string {
    const sessionId = c.get("sessionId");
    if (!sessionId) {
        throw new Error("Session not found");
    }
    return sessionId;
}

export async function ensureUserInDbMiddleware(
    c: Context,
    next: () => Promise<void>
): Promise<Response | undefined> {
    const userId = getCurrentUserId(c);

    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user || !user[0]) {
        return c.json({ error: { message: "User not found" } }, 404);
    }

    await next();
}
