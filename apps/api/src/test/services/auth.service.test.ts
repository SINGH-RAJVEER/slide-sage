import { describe, expect, it } from "bun:test";
import {
    createAuth,
    hashAuthPassword,
    isLegacyPasswordHash,
    verifyAuthPassword,
} from "../../services/auth";

async function sha256(value: string): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(hashBuffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

describe("auth service password security", () => {
    it("configures Better Auth password handling and reset session revocation", () => {
        const auth = createAuth({
            BASE_URL: "http://localhost:8000",
            NODE_ENV: "test",
        });

        expect(auth.options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
        expect(auth.options.emailAndPassword?.password?.hash).toBe(hashAuthPassword);
        expect(auth.options.emailAndPassword?.password?.verify).toBe(verifyAuthPassword);
    });

    it("verifies Better Auth hashes and rejects malformed hashes", async () => {
        const password = "correct-password";
        const hash = await hashAuthPassword(password);

        expect(await verifyAuthPassword({ hash, password })).toBe(true);
        expect(await verifyAuthPassword({ hash, password: "wrong-password" })).toBe(false);
        expect(await verifyAuthPassword({ hash: "not-a-valid-password-hash", password })).toBe(
            false
        );
    });

    it("supports legacy SHA-256 hashes for lazy account upgrades", async () => {
        const password = "correct-password";
        const hash = await sha256(password);

        expect(isLegacyPasswordHash(hash)).toBe(true);
        expect(await verifyAuthPassword({ hash, password })).toBe(true);
        expect(await verifyAuthPassword({ hash, password: "wrong-password" })).toBe(false);
    });
});
