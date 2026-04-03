import { authClient } from "@slide-sage/auth";
import { accounts, db, users } from "@slide-sage/db";
import { hashPassword as hashBetterAuthPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";

const authRoutes = new Hono();

async function hashLegacyPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
