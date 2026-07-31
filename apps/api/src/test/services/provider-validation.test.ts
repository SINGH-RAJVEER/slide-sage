import { describe, expect, it, mock } from "bun:test";
import {
    ProviderValidationError,
    validateProviderKey,
} from "../../services/ai/provider-validation";

describe("provider key validation", () => {
    it("uses Google's model catalog transport and returns compatible models", async () => {
        const fetchImpl = mock((url: string | URL | Request, init?: RequestInit) => {
            expect(String(url)).toContain("generativelanguage.googleapis.com/v1beta/models");
            expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("google-key");
            return Promise.resolve(
                Response.json({ models: [{ name: "models/gemini-2.5-flash" }] })
            );
        }) as unknown as typeof fetch;

        const models = await validateProviderKey("google", "google-key", undefined, fetchImpl);

        expect(models.map((model) => model.model)).toEqual(["gemini-2.5-flash"]);
    });

    it("uses Anthropic's versioned transport and rejects zero compatible models", async () => {
        const fetchImpl = mock((url: string | URL | Request, init?: RequestInit) => {
            expect(String(url)).toBe("https://api.anthropic.com/v1/models?limit=1000");
            const headers = new Headers(init?.headers);
            expect(headers.get("x-api-key")).toBe("anthropic-key");
            expect(headers.get("anthropic-version")).toBe("2023-06-01");
            return Promise.resolve(Response.json({ data: [{ id: "unrelated-model" }] }));
        }) as unknown as typeof fetch;

        try {
            await validateProviderKey("anthropic", "anthropic-key", undefined, fetchImpl);
            throw new Error("Expected validation to fail");
        } catch (error) {
            expect(error).toBeInstanceOf(ProviderValidationError);
            expect((error as ProviderValidationError).incompatible).toBe(true);
        }
    });
});
