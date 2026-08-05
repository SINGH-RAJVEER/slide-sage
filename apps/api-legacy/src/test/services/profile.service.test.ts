import { beforeEach, describe, expect, it, mock } from "bun:test";

type User = {
    id: string;
    name: string;
    email: string;
    image: string | null;
    emailVerified: boolean;
    slideTokens: number;
    createdAt: Date;
};

const findUser = mock();
const updateValues: unknown[] = [];
const deletedIdentifiers: string[][] = [];
let updatedUser: User | undefined;
let verificationConsumed = true;

const transaction = mock(async (callback: (tx: typeof transactionDatabase) => unknown) =>
    callback(transactionDatabase)
);

function updateQuery() {
    return {
        set: (value: unknown) => {
            updateValues.push(value);
            return {
                where: () => ({
                    returning: () => Promise.resolve(updatedUser ? [updatedUser] : []),
                }),
            };
        },
    };
}

const transactionDatabase = {
    delete: () => ({
        where: (condition: { values?: string[] }) => {
            if (condition.values) deletedIdentifiers.push(condition.values);
            return {
                returning: () =>
                    Promise.resolve(verificationConsumed ? [{ id: "verification_1" }] : []),
            };
        },
    }),
    query: {
        users: {
            findFirst: findUser,
        },
    },
    execute: () => Promise.resolve(),
    update: updateQuery,
};

mock.module("drizzle-orm", () => ({
    and: (...conditions: unknown[]) => ({ conditions, op: "and" }),
    desc: (value: unknown) => value,
    eq: (left: unknown, right: unknown) => ({ left, right, op: "eq" }),
    gt: (left: unknown, right: unknown) => ({ left, right, op: "gt" }),
    inArray: (left: unknown, values: string[]) => ({ left, values, op: "inArray" }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

mock.module("@/database", () => ({
    users: {
        email: "email",
        id: "userId",
    },
    verifications: {
        id: "verificationId",
        identifier: "identifier",
    },
    db: {
        query: transactionDatabase.query,
        transaction,
        update: updateQuery,
    },
}));

const { completeEmailChange, updateUserAvatar } = await import("../../services/profile.service");

function user(overrides: Partial<User> = {}): User {
    return {
        id: "user_1",
        name: "Existing Name",
        email: "old@example.com",
        image: null,
        emailVerified: true,
        slideTokens: 50,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    };
}

describe("profile service", () => {
    beforeEach(() => {
        findUser.mockReset();
        transaction.mockClear();
        updateValues.length = 0;
        deletedIdentifiers.length = 0;
        updatedUser = undefined;
        verificationConsumed = true;
    });

    it("completes a verified email change and invalidates old and new OTPs", async () => {
        const existingUser = user();
        updatedUser = user({
            email: "new@example.com",
            emailVerified: true,
        });
        findUser.mockResolvedValueOnce(existingUser);
        findUser.mockResolvedValueOnce(null);

        const result = await completeEmailChange(
            existingUser.id,
            "new@example.com",
            "verification_1"
        );

        expect(result.success).toBe(true);
        expect(updateValues).toEqual([
            {
                email: "new@example.com",
                emailVerified: true,
            },
        ]);
        expect(deletedIdentifiers).toEqual([
            [
                "email-verification-otp-old@example.com",
                "sign-in-otp-old@example.com",
                "forget-password-otp-old@example.com",
                "email-verification-otp-new@example.com",
                "sign-in-otp-new@example.com",
                "forget-password-otp-new@example.com",
            ],
        ]);
        expect(transaction).toHaveBeenCalledTimes(1);
    });

    it("rejects an email owned by another user without updating or deleting OTPs", async () => {
        findUser.mockResolvedValueOnce(user());
        findUser.mockResolvedValueOnce(user({ id: "user_2", email: "taken@example.com" }));

        const result = await completeEmailChange("user_1", "taken@example.com", "verification_1");

        expect(result).toEqual({ success: false, error: "Email already in use" });
        expect(updateValues).toEqual([]);
        expect(deletedIdentifiers).toEqual([]);
    });

    it("rejects an email change when its verification was already consumed", async () => {
        verificationConsumed = false;
        findUser.mockResolvedValueOnce(user());
        findUser.mockResolvedValueOnce(null);

        const result = await completeEmailChange("user_1", "new@example.com", "verification_1");

        expect(result).toEqual({
            success: false,
            error: "Verification code is invalid or expired",
        });
        expect(findUser).toHaveBeenCalledTimes(2);
        expect(updateValues).toEqual([]);
    });

    it("stores a trimmed HTTPS avatar URL", async () => {
        updatedUser = user({ image: "https://example.com/avatar.png" });

        const result = await updateUserAvatar("user_1", "  https://example.com/avatar.png  ");

        expect(result.success).toBe(true);
        expect(updateValues).toEqual([{ image: "https://example.com/avatar.png" }]);
    });

    it("rejects insecure, credentialed, controlled, and oversized avatar URLs", async () => {
        const results = await Promise.all([
            updateUserAvatar("user_1", "http://example.com/avatar.png"),
            updateUserAvatar("user_1", "https://user:secret@example.com/avatar.png"),
            updateUserAvatar("user_1", "https://example.com/avatar\n.png"),
            updateUserAvatar("user_1", `https://example.com/${"a".repeat(2049)}`),
        ]);

        expect(results.every((result) => !result.success)).toBe(true);
        expect(updateValues).toEqual([]);
    });
});
