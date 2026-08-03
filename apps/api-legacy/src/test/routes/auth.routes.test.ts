import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const deletedVerificationIds: string[] = [];
const verificationRows: Array<{ id: string; identifier: string }> = [];
const updates: unknown[] = [];
const proxiedBodies: unknown[] = [];
let deliveryFailed = false;
const authHandler = mock();
const findUser = mock();
const findAccount = mock();

mock.module("../../middleware/rate-limit", () => ({
    clientAddress: () => "127.0.0.1",
    requestEmail: () => null,
    rateLimit: () => async (_c: unknown, next: () => Promise<void>) => await next(),
}));

mock.module("drizzle-orm", () => ({
    and: (...conditions: unknown[]) => ({ conditions, op: "and" }),
    eq: (left: unknown, right: unknown) => ({ left, right, op: "eq" }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

mock.module("../../services/auth", () => ({
    consumeOTPDeliveryFailure: () => {
        const failed = deliveryFailed;
        deliveryFailed = false;
        return failed;
    },
    createAuth: () => ({
        handler: authHandler,
    }),
    runWithOTPDeliveryRequest: (_request: Request, callback: () => unknown) => callback(),
    hashAuthPassword: () => Promise.resolve("better-auth-hash"),
    isLegacyPasswordHash: (hash: string) => /^[a-f\d]{64}$/i.test(hash),
    verifyAuthPassword: async ({ hash, password }: { hash: string; password: string }) =>
        hash.toLowerCase() === (await sha256(password)),
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
        id: "verificationId",
        identifier: "identifier",
    },
    db: {
        delete: () => ({
            where: (condition: { left?: string; right?: string }) => {
                if (condition.left === "verificationId" && typeof condition.right === "string") {
                    deletedVerificationIds.push(condition.right);
                    const index = verificationRows.findIndex(({ id }) => id === condition.right);
                    if (index >= 0) {
                        verificationRows.splice(index, 1);
                    }
                }
                return Promise.resolve();
            },
        }),
        select: () => ({
            from: () => ({
                where: (condition: { right?: string }) =>
                    Promise.resolve(
                        verificationRows
                            .filter(({ identifier }) => identifier === condition.right)
                            .map(({ id }) => ({ id }))
                    ),
            }),
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
        transaction: async (callback: (tx: { execute: () => Promise<unknown[]> }) => unknown) =>
            await callback({ execute: () => Promise.resolve([]) }),
    },
    runWithDatabase: (_database: unknown, callback: () => unknown) => callback(),
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
        deletedVerificationIds.length = 0;
        verificationRows.length = 0;
        updates.length = 0;
        proxiedBodies.length = 0;
        deliveryFailed = false;
        authHandler.mockReset();
        findUser.mockReset();
        findAccount.mockReset();
        authHandler.mockImplementation(async (request: Request) => {
            if (request.method !== "GET") {
                proxiedBodies.push(await request.clone().json());
            }
            return new Response(JSON.stringify({ proxied: true }), { status: 202 });
        });
    });

    it("normalizes OTP emails and removes only the prior OTP after Better Auth succeeds", async () => {
        const identifier = "email-verification-otp-user@example.com";
        verificationRows.push({ id: "old_otp", identifier });
        authHandler.mockImplementationOnce(async (request: Request) => {
            expect(deletedVerificationIds).toEqual([]);
            proxiedBodies.push(await request.clone().json());
            verificationRows.push({ id: "new_otp", identifier });
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        });

        const response = await app().request("/auth/email-otp/send-verification-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: " USER@Example.com ",
                type: "email-verification",
            }),
        });

        expect(response.status).toBe(200);
        expect(proxiedBodies).toEqual([{ email: "user@example.com", type: "email-verification" }]);
        expect(deletedVerificationIds).toEqual(["old_otp"]);
        expect(verificationRows).toEqual([{ id: "new_otp", identifier }]);
        expect(authHandler).toHaveBeenCalled();
    });

    it("normalizes password reset emails before proxying to Better Auth", async () => {
        await app().request("/auth/email-otp/request-password-reset", {
            method: "POST",
            body: JSON.stringify({ email: " USER@Example.com " }),
        });

        expect(proxiedBodies).toEqual([{ email: "user@example.com" }]);
        expect(authHandler).toHaveBeenCalled();
    });

    it("preserves a valid OTP and removes the failed replacement on delivery failure", async () => {
        const identifier = "sign-in-otp-user@example.com";
        verificationRows.push({ id: "old_otp", identifier });
        deliveryFailed = true;
        authHandler.mockImplementationOnce(async () => {
            verificationRows.push({ id: "undelivered_otp", identifier });
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        });

        const response = await app().request("/auth/email-otp/send-verification-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "user@example.com", type: "sign-in" }),
        });

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({
            error: { message: "Email delivery is temporarily unavailable" },
        });
        expect(deletedVerificationIds).toEqual(["undelivered_otp"]);
        expect(verificationRows).toEqual([{ id: "old_otp", identifier }]);
    });

    it("preserves a valid OTP when Better Auth rejects its replacement", async () => {
        const identifier = "forget-password-otp-user@example.com";
        verificationRows.push({ id: "old_otp", identifier });
        authHandler.mockImplementationOnce(async () => {
            verificationRows.push({ id: "rejected_otp", identifier });
            return new Response(JSON.stringify({ message: "Rejected" }), { status: 400 });
        });

        const response = await app().request("/auth/email-otp/request-password-reset", {
            method: "POST",
            body: JSON.stringify({ email: "user@example.com" }),
        });

        expect(response.status).toBe(400);
        expect(deletedVerificationIds).toEqual(["rejected_otp"]);
        expect(verificationRows).toEqual([{ id: "old_otp", identifier }]);
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
        expect(proxiedBodies).toEqual([{ email: "user@example.com", password: legacyPassword }]);
    });

    it("lazily upgrades a SHA-256 credential password before proxying sign-in", async () => {
        const password = "correct-password";
        findUser.mockResolvedValue({ id: "user_1", email: "user@example.com" });
        findAccount.mockResolvedValue({
            id: "credential_account_1",
            password: await sha256(password),
        });

        const response = await app().request("/auth/sign-in/email", {
            method: "POST",
            body: JSON.stringify({ email: "user@example.com", password }),
        });

        expect(response.status).toBe(202);
        expect(updates).toEqual([{ password: "better-auth-hash" }]);
        expect(findAccount).toHaveBeenCalledTimes(1);
        expect(authHandler).toHaveBeenCalled();
    });

    it("does not upgrade a legacy hash when the password does not match", async () => {
        findUser.mockResolvedValue({ id: "user_1", email: "user@example.com" });
        findAccount.mockResolvedValueOnce(null);
        findAccount.mockResolvedValueOnce({
            id: "legacy_account_1",
            password: await sha256("correct-password"),
        });

        await app().request("/auth/sign-in/email", {
            method: "POST",
            body: JSON.stringify({ email: "user@example.com", password: "wrong-password" }),
        });

        expect(updates).toEqual([]);
        expect(authHandler).toHaveBeenCalled();
    });

    it("proxies unhandled auth routes to better-auth", async () => {
        const response = await app().request("/auth/session", { method: "GET" });

        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ proxied: true });
        expect(authHandler).toHaveBeenCalled();
    });
});
