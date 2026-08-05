import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { ProviderValidationError } from "../../services/ai/provider-validation";

const service = {
    connect: mock(),
    delete: mock(),
    getConfiguration: mock(),
    select: mock(),
};

mock.module("../../middleware/rate-limit", () => ({
    userRateLimit: () => async (_c: unknown, next: () => Promise<void>) => await next(),
}));

mock.module("../../services/auth.middleware", () => ({
    authMiddleware: async (
        c: { set: (key: string, value: string) => void },
        next: () => Promise<void>
    ) => {
        c.set("userId", "user_1");
        await next();
    },
    getCurrentUserId: () => "user_1",
}));

mock.module("../../services/ai-connections.service", () => ({
    AIConnectionService: class {
        connect = service.connect;
        delete = service.delete;
        getConfiguration = service.getConfiguration;
        select = service.select;
    },
}));

const routes = (await import("../../routes/ai-connections.routes")).default;

function app() {
    const hono = new Hono();
    hono.route("/api/ai", routes);
    return hono;
}

describe("AI connection routes", () => {
    beforeEach(() => {
        service.connect.mockReset();
        service.delete.mockReset();
        service.getConfiguration.mockReset();
        service.select.mockReset();
    });

    it("returns the authenticated user's AI configuration", async () => {
        const configuration = {
            generation: { mode: "openrouter", model: "test/model", billing: "points" },
            eligibility: { eligible: false, slideTokens: 10, minimumPointsExclusive: 50 },
            connections: [],
            models: [],
            selection: null,
        };
        service.getConfiguration.mockResolvedValue(configuration);

        const response = await app().request("/api/ai/config");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(configuration);
        expect(service.getConfiguration).toHaveBeenCalledWith("user_1", expect.any(AbortSignal));
    });

    it("creates a validated provider connection", async () => {
        service.connect.mockResolvedValue({
            connection: { provider: "google" },
            availableModels: [],
        });

        const response = await app().request("/api/ai/connections", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "google", apiKey: "provider-test-key" }),
        });

        expect(response.status).toBe(201);
        expect(service.connect).toHaveBeenCalledWith(
            "user_1",
            "google",
            "provider-test-key",
            expect.any(AbortSignal)
        );
    });

    it("projects provider compatibility and unexpected errors safely", async () => {
        service.connect.mockRejectedValueOnce(
            new ProviderValidationError("No compatible models", "incompatible")
        );
        let response = await app().request("/api/ai/connections", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "anthropic", apiKey: "provider-test-key" }),
        });
        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({
            error: { message: "No compatible models", code: "PROVIDER_NO_COMPATIBLE_MODELS" },
        });

        service.connect.mockRejectedValueOnce(new Error("secret provider response"));
        response = await app().request("/api/ai/connections", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "anthropic", apiKey: "provider-test-key" }),
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
            error: { message: "AI provider request failed" },
        });
    });
});
