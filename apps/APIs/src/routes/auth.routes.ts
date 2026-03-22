import { authClient } from "@slide-sage/auth";
import { accounts, db, users } from "@slide-sage/db";
import { hashPassword as hashBetterAuthPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import {
    resendVerificationCode,
    signUpWithEmail,
    verifyEmailCode,
} from "../services/email-auth.service";

const authRoutes = new Hono();

function resolveRequestOrigin(c: Context): string {
    const explicitBaseUrl = process.env.BASE_URL?.trim();
    if (explicitBaseUrl) {
        return explicitBaseUrl.replace(/\/$/, "");
    }

    const forwardedProto = c.req.header("x-forwarded-proto");
    const proto = forwardedProto || new URL(c.req.url).protocol.replace(":", "") || "http";
    const forwardedHost = c.req.header("x-forwarded-host");
    const host = forwardedHost || c.req.header("host") || "localhost:8000";

    return `${proto}://${host}`;
}

async function attachSessionCookie(c: Context, email: string, password: string): Promise<void> {
    const requestOrigin = resolveRequestOrigin(c);
    const signInUrl = `${requestOrigin}/api/auth/sign-in/email`;
    const signInResponse = await fetch(signInUrl, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            origin: c.req.header("origin") || requestOrigin,
            "user-agent": c.req.header("user-agent") || "slide-sage-server",
            "x-forwarded-for": c.req.header("x-forwarded-for") || "127.0.0.1",
            "x-forwarded-proto": c.req.header("x-forwarded-proto") || "http",
            "x-forwarded-host": c.req.header("x-forwarded-host") || "localhost",
        },
        body: JSON.stringify({
            email,
            password,
            rememberMe: true,
        }),
    });

    const setCookie = signInResponse.headers.get("set-cookie");

    if (setCookie) {
        c.header("set-cookie", setCookie, { append: true });
    }
}

async function hashLegacyPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Custom endpoints for email verification flow
authRoutes.post("/signup/email", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { email, password, name } = body;

    if (!email || !password || !name) {
        return c.json(
            {
                error: {
                    message: "Email, password, and name are required",
                },
            },
            400
        );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const result = await signUpWithEmail(normalizedEmail, password, name);

    if (!result.success) {
        return c.json(
            {
                error: {
                    message: result.error || "Sign up failed",
                },
            },
            400
        );
    }

    await attachSessionCookie(c, normalizedEmail, password);

    return c.json(
        {
            success: true,
            message: "Account created. Verification code sent to email.",
            userId: result.userId,
        },
        201
    );
});

// Verify email code endpoint
authRoutes.post("/verify-code", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { email, code, password } = body;

    if (!email || !code) {
        return c.json(
            {
                error: {
                    message: "Email and code are required",
                },
            },
            400
        );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const result = await verifyEmailCode(normalizedEmail, code);

    if (!result.success) {
        return c.json(
            {
                error: {
                    message: result.error || "Verification failed",
                },
            },
            400
        );
    }

    if (typeof password === "string" && password.length > 0) {
        await attachSessionCookie(c, normalizedEmail, password);
    }

    return c.json({
        success: true,
        message: "Email verified successfully",
        user: result.user,
    });
});

// Resend verification code endpoint
authRoutes.post("/resend-code", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { email } = body;

    if (!email) {
        return c.json(
            {
                error: {
                    message: "Email is required",
                },
            },
            400
        );
    }

    const result = await resendVerificationCode(email);

    if (!result.success) {
        return c.json(
            {
                error: {
                    message: result.error || "Failed to resend code",
                },
            },
            400
        );
    }

    return c.json({
        success: true,
        message: "Verification code sent",
    });
});

// Compatibility shim for legacy accounts created before provider/password format fix.
authRoutes.post("/sign-in/email", async (c) => {
    const parsedRequest = c.req.raw.clone();
    const body = await parsedRequest.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
        return authClient.handler(c.req.raw);
    }

    const user = await db.query.users.findFirst({
        where: eq(users.email, email.toLowerCase()),
    });

    if (user) {
        const credentialAccount = await db.query.accounts.findFirst({
            where: and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")),
        });

        if (!credentialAccount) {
            const legacyAccount = await db.query.accounts.findFirst({
                where: and(eq(accounts.userId, user.id), eq(accounts.providerId, "email")),
            });

            if (legacyAccount?.password) {
                const legacyHash = await hashLegacyPassword(password);
                if (legacyHash === legacyAccount.password) {
                    const compatibleHash = await hashBetterAuthPassword(password);
                    await db
                        .update(accounts)
                        .set({
                            providerId: "credential",
                            accountId: user.id,
                            password: compatibleHash,
                        })
                        .where(eq(accounts.id, legacyAccount.id));
                }
            }
        }
    }

    return authClient.handler(c.req.raw);
});

// All other auth routes handled by better-auth
authRoutes.all("/*", (c) => authClient.handler(c.req.raw));

export default authRoutes;
