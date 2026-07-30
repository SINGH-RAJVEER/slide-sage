import type {
    AIConfigurationResponse,
    AIProvider,
    UpdateAISelectionRequest,
    UpsertAIConnectionRequest,
} from "@slide-sage/types";
import type { Context } from "hono";
import { Hono } from "hono";
import { ProviderValidationError } from "../services/ai/provider-validation";
import { AIConnectionService } from "../services/ai-connections.service";
import { authMiddleware, getCurrentUserId } from "../services/auth.middleware";

const routes = new Hono();
const service = new AIConnectionService();
const providers = new Set<AIProvider>(["openai", "google", "anthropic"]);

routes.use("*", authMiddleware);

function parseProvider(value: unknown): AIProvider | null {
    return typeof value === "string" && providers.has(value as AIProvider)
        ? (value as AIProvider)
        : null;
}

function errorResponse(c: Context, error: unknown) {
    if (error instanceof ProviderValidationError) {
        return c.json(
            {
                error: {
                    message: error.message,
                    code: error.rejected
                        ? "PROVIDER_KEY_REJECTED"
                        : "PROVIDER_VALIDATION_UNAVAILABLE",
                },
            },
            error.rejected ? 403 : 502
        );
    }
    if (error instanceof Error && error.name === "BYOKPointsRequiredError") {
        return c.json(
            {
                error: { message: error.message, code: "BYOK_POINTS_REQUIRED" },
                minimum_points_exclusive: 50,
            },
            403
        );
    }
    const message = error instanceof Error ? error.message : "AI provider request failed";
    return c.json({ error: { message } }, 400);
}

routes.get("/config", async (c) => {
    try {
        const config = await service.getConfiguration(getCurrentUserId(c));
        return c.json(config satisfies AIConfigurationResponse);
    } catch (error) {
        return errorResponse(c, error);
    }
});

routes.post("/connections", async (c) => {
    try {
        const body = (await c.req.json().catch(() => ({}))) as Partial<UpsertAIConnectionRequest>;
        const provider = parseProvider(body.provider);
        if (!provider || typeof body.apiKey !== "string") {
            return c.json({ error: { message: "Provider and API key are required" } }, 400);
        }
        return c.json(await service.connect(getCurrentUserId(c), provider, body.apiKey), 201);
    } catch (error) {
        return errorResponse(c, error);
    }
});

routes.put("/connections/:provider", async (c) => {
    try {
        const provider = parseProvider(c.req.param("provider"));
        const body = (await c.req.json().catch(() => ({}))) as { apiKey?: unknown };
        if (!provider || typeof body.apiKey !== "string") {
            return c.json({ error: { message: "Provider and API key are required" } }, 400);
        }
        return c.json(await service.connect(getCurrentUserId(c), provider, body.apiKey));
    } catch (error) {
        return errorResponse(c, error);
    }
});

routes.delete("/connections/:provider", async (c) => {
    try {
        const provider = parseProvider(c.req.param("provider"));
        if (!provider) return c.json({ error: { message: "Invalid provider" } }, 400);
        await service.delete(getCurrentUserId(c), provider);
        return c.body(null, 204);
    } catch (error) {
        return errorResponse(c, error);
    }
});

routes.put("/selection", async (c) => {
    try {
        const body = (await c.req.json().catch(() => ({}))) as Partial<UpdateAISelectionRequest>;
        const provider = parseProvider(body.provider);
        if (!provider || typeof body.model !== "string") {
            return c.json({ error: { message: "Provider and model are required" } }, 400);
        }
        await service.select(getCurrentUserId(c), { provider, model: body.model });
        return c.json({ selection: { provider, model: body.model } });
    } catch (error) {
        return errorResponse(c, error);
    }
});

export default routes;
