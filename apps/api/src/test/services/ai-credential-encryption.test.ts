import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { decryptApiKey, encryptApiKey } from "../../services/ai-credential-encryption";

describe("AI credential encryption", () => {
    beforeEach(() => {
        process.env["BYOK_ENCRYPTION_KEY_CURRENT_VERSION"] = "1";
        process.env["BYOK_ENCRYPTION_KEY_V1"] = Buffer.alloc(32, 7).toString("base64");
    });

    afterEach(() => {
        delete process.env["BYOK_ENCRYPTION_KEY_CURRENT_VERSION"];
        delete process.env["BYOK_ENCRYPTION_KEY_V1"];
    });

    it("encrypts with random IVs and decrypts for the owning user and provider", async () => {
        const first = await encryptApiKey("user-1", "openai", "sk-secret-key");
        const second = await encryptApiKey("user-1", "openai", "sk-secret-key");

        expect(first.encryptedApiKey).not.toBe(second.encryptedApiKey);
        expect(first.keyLastFour).toBe("-key");
        expect(await decryptApiKey("user-1", "openai", first)).toBe("sk-secret-key");
    });

    it("rejects credentials moved between users or providers", async () => {
        const encrypted = await encryptApiKey("user-1", "openai", "sk-secret-key");

        await expect(decryptApiKey("user-2", "openai", encrypted)).rejects.toThrow();
        await expect(decryptApiKey("user-1", "anthropic", encrypted)).rejects.toThrow();
    });
});
