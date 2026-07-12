import { accounts, db, users, verifications } from "@slide-sage/database";
import { hashPassword as hashBetterAuthPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createAuth, type Env } from "../services/auth";

const authRoutes = new Hono();

function getAuthEnv(env: unknown): Env {
    return (env ?? {}) as Env;
}

type EmailOTPType = "email-verification" | "sign-in" | "forget-password";

function isEmailOTPType(value: unknown): value is EmailOTPType {
    return value === "email-verification" || value === "sign-in" || value === "forget-password";
}

async function deleteExistingOTP(identifier: string): Promise<void> {
    await db.delete(verifications).where(eq(verifications.identifier, identifier));
}

async function hashLegacyPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

authRoutes.post("/email-otp/send-verification-otp", async (c) => {
    const body = await c.req.raw
        .clone()
        .json()
        .catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const type = isEmailOTPType(body.type) ? body.type : null;

    if (email && type) {
        await deleteExistingOTP(`${type}-otp-${email}`);
    }

    return createAuth(getAuthEnv(c.env)).handler(c.req.raw);
});

authRoutes.post("/email-otp/request-password-reset", async (c) => {
    const body = await c.req.raw
        .clone()
        .json()
        .catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (email) {
        await deleteExistingOTP(`forget-password-otp-${email}`);
    }

    return createAuth(getAuthEnv(c.env)).handler(c.req.raw);
});

// Compatibility shim for legacy accounts created before provider/password format fix.
authRoutes.post("/sign-in/email", async (c) => {
    const parsedRequest = c.req.raw.clone();
    const body = await parsedRequest.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
        return createAuth(getAuthEnv(c.env)).handler(c.req.raw);
    }

    try {
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
    } catch (err) {
        console.error(
            "Legacy auth migration error:",
            err instanceof Error ? err.message : String(err)
        );
    }

    return createAuth(getAuthEnv(c.env)).handler(c.req.raw);
});

// All other auth routes handled by better-auth
authRoutes.all("/*", (c) => createAuth(getAuthEnv(c.env)).handler(c.req.raw));

export default authRoutes;
