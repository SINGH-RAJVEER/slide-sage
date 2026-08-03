import type { ProfileAvatarResponse, ProfileResponse, UpdateAvatarRequest } from "@slidesage/types";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { db, users, verifications } from "@/database";
import { userRateLimit } from "../middleware/rate-limit";
import {
    authMiddleware,
    createAuth,
    type Env,
    getCurrentUserId,
    sendOTPEmail,
} from "../services/auth";
import {
    completeEmailChange,
    getUserProfile,
    updateUserAvatar,
    updateUserProfile,
} from "../services/profile.service";
import { logSafeError } from "../utils/safe-logging";

const profileRoutes = new Hono();
const profileBodyLimit = bodyLimit({
    maxSize: 32 * 1024,
    onError: (c) => c.json({ error: { message: "Request body is too large" } }, 413),
});
const profileMutationRateLimit = userRateLimit("profile:mutation", 10, 15 * 60);
const emailVerificationRateLimit = userRateLimit("profile:email-verification", 10, 15 * 60);

function getAuthEnv(env: unknown): Env {
    return (env ?? {}) as Env;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
    return Object.hasOwn(value, key);
}

function asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function normalizeEmail(value: string): string | null {
    const email = value.trim().toLowerCase();
    if (email.length < 3 || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return null;
    }
    return email;
}

function emailChangeIdentifier(userId: string, email: string): string {
    return `email-change-otp-${userId}-${email}`;
}

function emailChangeIdentifierPrefix(userId: string): string {
    return `email-change-otp-${userId}-`;
}

async function hashEmailChangeOTP(env: Env, userId: string, email: string, otp: string) {
    const secret =
        env["AUTH_SECRET"] ?? process.env["AUTH_SECRET"] ?? "slidesage-local-development-secret";
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const digest = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${userId}\0${email}\0${otp}`)
    );
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

function constantTimeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index++) {
        difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
}

async function makeCompatiblePasswordError(response: Response): Promise<Response> {
    let message = "Unable to change password";
    if (response.status < 500) {
        const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
        if (typeof body?.message === "string" && body.message) {
            message = body.message;
        }
    }

    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ error: { message } }), {
        status: response.status,
        headers,
    });
}

// All profile routes require authentication
profileRoutes.use("*", profileBodyLimit);
profileRoutes.use("*", authMiddleware);

/**
 * GET /api/profile
 * Get current user's profile
 */
profileRoutes.get("/", async (c) => {
    try {
        const userId = getCurrentUserId(c);
        const result = await getUserProfile(userId);

        if (!result.success) {
            return c.json({ error: { message: result.error } }, 400);
        }

        return c.json({ user: result.user } satisfies ProfileResponse);
    } catch (error) {
        logSafeError("profile_route_failed", error);
        return c.json({ error: { message: "Internal server error" } }, 500);
    }
});

/**
 * PUT /api/profile
 * Update user profile details or delegate a password-only update to Better Auth.
 */
profileRoutes.put("/", profileMutationRateLimit, async (c) => {
    try {
        const userId = getCurrentUserId(c);
        const body = asObject(await c.req.json().catch(() => ({})));
        const hasProfileFields = hasOwn(body, "name") || hasOwn(body, "email");
        const hasNewPassword = hasOwn(body, "newPassword");

        if (hasProfileFields && hasNewPassword) {
            return c.json(
                {
                    error: {
                        message: "Password changes cannot be combined with profile updates",
                    },
                },
                400
            );
        }

        if (hasNewPassword) {
            const currentPassword = body["currentPassword"];
            const newPassword = body["newPassword"];
            if (
                typeof currentPassword !== "string" ||
                !currentPassword ||
                typeof newPassword !== "string" ||
                !newPassword
            ) {
                return c.json(
                    { error: { message: "Current password and new password are required" } },
                    400
                );
            }

            const response = await createAuth(getAuthEnv(c.env)).api.changePassword({
                headers: c.req.raw.headers,
                body: {
                    currentPassword,
                    newPassword,
                    revokeOtherSessions: true,
                },
                asResponse: true,
            });

            return response.ok ? response : makeCompatiblePasswordError(response);
        }

        const name = typeof body["name"] === "string" ? body["name"] : undefined;
        const email = typeof body["email"] === "string" ? body["email"] : undefined;
        if (!name && !email) {
            return c.json({ error: { message: "Nothing to update" } }, 400);
        }

        if (email) {
            if (name) {
                return c.json(
                    { error: { message: "Email changes cannot be combined with name updates" } },
                    400
                );
            }
            const currentPassword = body["currentPassword"];
            if (typeof currentPassword !== "string" || !currentPassword) {
                return c.json(
                    { error: { message: "Current password is required to change email" } },
                    400
                );
            }

            try {
                const verification = await createAuth(getAuthEnv(c.env)).api.verifyPassword({
                    headers: c.req.raw.headers,
                    body: { password: currentPassword },
                });
                if (!verification.status) {
                    return c.json({ error: { message: "Current password is incorrect" } }, 400);
                }
            } catch {
                return c.json({ error: { message: "Current password is incorrect" } }, 400);
            }

            const normalizedEmail = normalizeEmail(email);
            if (!normalizedEmail) {
                return c.json({ error: { message: "Enter a valid email address" } }, 400);
            }
            const existing = await db.query.users.findFirst({
                where: eq(users.email, normalizedEmail),
            });
            if (existing && existing.id !== userId) {
                return c.json({ error: { message: "Email already in use" } }, 400);
            }
            const currentUser = await db.query.users.findFirst({ where: eq(users.id, userId) });
            if (!currentUser) return c.json({ error: { message: "User not found" } }, 404);

            const randomValue = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
            const otp = String(randomValue % 1_000_000).padStart(6, "0");
            const identifier = emailChangeIdentifier(userId, normalizedEmail);
            const value = await hashEmailChangeOTP(getAuthEnv(c.env), userId, normalizedEmail, otp);
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
            const delivered = await db.transaction(async (tx) => {
                await tx.execute(
                    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`email-change-otp-${userId}`}, 0))`
                );
                const previous = await tx
                    .select({ id: verifications.id })
                    .from(verifications)
                    .where(
                        sql`left(${verifications.identifier}, ${emailChangeIdentifierPrefix(userId).length}) = ${emailChangeIdentifierPrefix(userId)}`
                    );
                const verificationId = crypto.randomUUID();
                await tx.insert(verifications).values({
                    id: verificationId,
                    identifier,
                    value,
                    expiresAt,
                });

                try {
                    await sendOTPEmail(
                        getAuthEnv(c.env),
                        normalizedEmail,
                        otp,
                        "email-verification",
                        currentUser.name
                    );
                } catch {
                    await tx.delete(verifications).where(eq(verifications.id, verificationId));
                    return false;
                }

                const previousIds = previous.map((entry) => entry.id);
                if (previousIds.length > 0) {
                    await tx.delete(verifications).where(inArray(verifications.id, previousIds));
                }
                return true;
            });
            if (!delivered) {
                return c.json(
                    { error: { message: "Email delivery is temporarily unavailable" } },
                    503
                );
            }

            const currentProfile = await getUserProfile(userId);
            if (!currentProfile.success) {
                return c.json({ error: { message: currentProfile.error } }, 400);
            }
            return c.json({
                user: currentProfile.user,
                pending_email: normalizedEmail,
                verification_required: true,
            });
        }

        const result = await updateUserProfile(userId, {
            name,
        });

        if (!result.success) {
            return c.json({ error: { message: result.error } }, 400);
        }

        return c.json({ user: result.user } satisfies ProfileResponse);
    } catch (error) {
        logSafeError("profile_update_route_failed", error);
        return c.json({ error: { message: "Internal server error" } }, 500);
    }
});

profileRoutes.post("/email/verify", emailVerificationRateLimit, async (c) => {
    try {
        const userId = getCurrentUserId(c);
        const body = asObject(await c.req.json().catch(() => ({})));
        const email = typeof body["email"] === "string" ? normalizeEmail(body["email"]) : null;
        const otp = typeof body["otp"] === "string" ? body["otp"] : "";
        if (!email || !/^\d{6}$/.test(otp)) {
            return c.json({ error: { message: "Email and a 6-digit code are required" } }, 400);
        }

        const identifier = emailChangeIdentifier(userId, email);
        const [verification] = await db
            .select()
            .from(verifications)
            .where(and(eq(verifications.identifier, identifier)))
            .orderBy(desc(verifications.createdAt))
            .limit(1);
        if (!verification || verification.expiresAt.getTime() <= Date.now()) {
            return c.json({ error: { message: "Verification code is invalid or expired" } }, 400);
        }
        const expected = await hashEmailChangeOTP(getAuthEnv(c.env), userId, email, otp);
        if (!constantTimeEqual(expected, verification.value)) {
            return c.json({ error: { message: "Verification code is invalid or expired" } }, 400);
        }

        const result = await completeEmailChange(userId, email, verification.id);
        if (!result.success) return c.json({ error: { message: result.error } }, 400);
        return c.json({ user: result.user } satisfies ProfileResponse);
    } catch (error) {
        logSafeError("profile_email_verification_failed", error);
        return c.json({ error: { message: "Internal server error" } }, 500);
    }
});

/**
 * POST /api/profile/avatar
 * Update user's profile avatar/image
 */
profileRoutes.post("/avatar", async (c) => {
    try {
        const userId = getCurrentUserId(c);
        const body = (await c.req.json().catch(() => ({}))) as Partial<UpdateAvatarRequest>;

        const { imageUrl } = body;

        if (typeof imageUrl !== "string" || !imageUrl.trim()) {
            return c.json({ error: { message: "Image URL is required" } }, 400);
        }

        const result = await updateUserAvatar(userId, imageUrl);

        if (!result.success) {
            return c.json({ error: { message: result.error } }, 400);
        }

        return c.json({ user: result.user } satisfies ProfileAvatarResponse);
    } catch (error) {
        logSafeError("profile_avatar_route_failed", error);
        return c.json({ error: { message: "Internal server error" } }, 500);
    }
});

export default profileRoutes;
