import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const deletedIdentifiers: string[] = [];
const updates: unknown[] = [];
const authHandler = mock();
const findUser = mock();
const findAccount = mock();

mock.module("drizzle-orm", () => ({
    and: (...conditions: unknown[]) => ({ conditions, op: "and" }),
    eq: (left: unknown, right: unknown) => ({ left, right, op: "eq" }),
}));

mock.module("better-auth/crypto", () => ({
    hashPassword: () => Promise.resolve("better-auth-hash"),
}));

mock.module("../../services/auth", () => ({
    createAuth: () => ({
        handler: authHandler,
    }),
}));

mock.module("@/database", () => ({
    accounts: {
        accountId: "accountId",
        id: "accountId",
        password: "password",
        providerId: "providerId",
        userId: "accountUserId",
    },
    users: {
        email: "email",
    },
    verifications: {
        identifier: "identifier",
    },
    db: {
        delete: () => ({
            where: (condition: { right?: string }) => {
                if (typeof condition.right === "string") {
                    deletedIdentifiers.push(condition.right);
                }
                return Promise.resolve();
            },
        }),
        query: {
            users: {
                findFirst: findUser,
            },
            accounts: {
                findFirst: findAccount,
            },
        },
        update: () => ({
            set: (value: unknown) => {
                updates.push(value);
                return {
                    where: () => Promise.resolve(),
                };
            },
        }),
    },
}));

const authRoutes = (await import("../../routes/auth.routes")).default;

function app() {
    const hono = new Hono();
    hono.route("/auth", authRoutes);
    return hono;
}

async function sha256(value: string): Promise<string> {
    const data = new TextEncoder().encode(value);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

describe("auth routes", () => {
    beforeEach(() => {
        deletedIdentifiers.length = 0;
        updates.length = 0;
        authHandler.mockReset();
        findUser.mockReset();
        findAccount.mockReset();
        authHandler.mockResolvedValue(
            new Response(JSON.stringify({ proxied: true }), { status: 202 })
        );
    });

    it("deletes existing verification OTPs before proxying to better-auth", async () => {
        const response = await app().request("/auth/email-otp/send-verification-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: " USER@Example.com ",
                type: "email-verification",
            }),
        });

        expect(response.status).toBe(202);
        expect(deletedIdentifiers).toEqual(["email-verification-otp-user@example.com"]);
        expect(authHandler).toHaveBeenCalled();
    });

    it("deletes existing password reset OTPs before proxying to better-auth", async () => {
        await app().request("/auth/email-otp/request-password-reset", {
            method: "POST",
            body: JSON.stringify({ email: "user@example.com" }),
        });

        expect(deletedIdentifiers).toEqual(["forget-password-otp-user@example.com"]);
        expect(authHandler).toHaveBeenCalled();
    });

    it("proxies sign-in directly when credentials are incomplete", async () => {
        const response = await app().request("/auth/sign-in/email", {
            method: "POST",
            body: JSON.stringify({ email: "user@example.com" }),
        });

        expect(response.status).toBe(202);
        expect(findUser).not.toHaveBeenCalled();
        expect(authHandler).toHaveBeenCalled();
    });

    it("migrates matching legacy email-provider passwords before proxying sign-in", async () => {
        const legacyPassword = "correct-password";
        findUser.mockResolvedValue({ id: "user_1", email: "user@example.com" });
        findAccount.mockResolvedValueOnce(null);
        findAccount.mockResolvedValueOnce({
            id: "legacy_account_1",
            password: await sha256(legacyPassword),
        });

        const response = await app().request("/auth/sign-in/email", {
            method: "POST",
            body: JSON.stringify({ email: "USER@example.com", password: legacyPassword }),
        });

        expect(response.status).toBe(202);
        expect(updates).toEqual([
            {
                providerId: "credential",
                accountId: "user_1",
                password: "better-auth-hash",
            },
        ]);
        expect(authHandler).toHaveBeenCalled();
    });

    it("proxies unhandled auth routes to better-auth", async () => {
        const response = await app().request("/auth/session", { method: "GET" });

        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ proxied: true });
        expect(authHandler).toHaveBeenCalled();
    });
});
