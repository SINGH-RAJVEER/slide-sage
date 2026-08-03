import type {
    AIConfigurationResponse,
    AIProvider,
    UpdateAISelectionRequest,
    UpsertAIConnectionRequest,
} from "@slidesage/types";
import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { userRateLimit } from "../middleware/rate-limit";
import { ProviderValidationError } from "../services/ai/provider-validation";
import { AIConnectionService } from "../services/ai-connections.service";
import { authMiddleware, getCurrentUserId } from "../services/auth.middleware";

const routes = new Hono();
const aiBodyLimit = bodyLimit({
    maxSize: 16 * 1024,
    onError: (c) => c.json({ error: { message: "Request body is too large" } }, 413),
});
const service = new AIConnectionService();
const providers = new Set<AIProvider>(["openai", "google", "anthropic"]);
const providerValidationRateLimit = userRateLimit("ai:provider-validation", 6, 10 * 60);
const providerMutationRateLimit = userRateLimit("ai:provider-mutation", 20, 10 * 60);

routes.use("*", aiBodyLimit);
routes.use("*", authMiddleware);

function parseProvider(value: unknown): AIProvider | null {
    return typeof value === "string" && providers.has(value as AIProvider)
        ? (value as AIProvider)
        : null;
}

function errorResponse(c: Context, error: unknown) {
    if (error instanceof ProviderValidationError) {
        const status = error.rejected ? 403 : error.incompatible ? 422 : 502;
        const code = error.rejected
            ? "PROVIDER_KEY_REJECTED"
            : error.incompatible
              ? "PROVIDER_NO_COMPATIBLE_MODELS"
              : "PROVIDER_VALIDATION_UNAVAILABLE";
        return c.json(
            {
                error: {
                    message: error.message,
                    code,
                },
            },
            status
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
    return c.json({ error: { message: "AI provider request failed" } }, 400);
}

routes.get("/config", async (c) => {
    try {
        const config = await service.getConfiguration(getCurrentUserId(c), c.req.raw.signal);
        return c.json(config satisfies AIConfigurationResponse);
    } catch (error) {
        return errorResponse(c, error);
    }
});

routes.post("/connections", providerValidationRateLimit, async (c) => {
    try {
        const body = (await c.req.json().catch(() => ({}))) as Partial<UpsertAIConnectionRequest>;
        const provider = parseProvider(body.provider);
        if (!provider || typeof body.apiKey !== "string") {
            return c.json({ error: { message: "Provider and API key are required" } }, 400);
        }
        return c.json(
            await service.connect(getCurrentUserId(c), provider, body.apiKey, c.req.raw.signal),
            201
        );
    } catch (error) {
        return errorResponse(c, error);
    }
});

routes.put("/connections/:provider", providerValidationRateLimit, async (c) => {
    try {
        const provider = parseProvider(c.req.param("provider"));
        const body = (await c.req.json().catch(() => ({}))) as { apiKey?: unknown };
        if (!provider || typeof body.apiKey !== "string") {
            return c.json({ error: { message: "Provider and API key are required" } }, 400);
        }
        return c.json(
            await service.connect(getCurrentUserId(c), provider, body.apiKey, c.req.raw.signal)
        );
    } catch (error) {
        return errorResponse(c, error);
    }
});

routes.delete("/connections/:provider", providerMutationRateLimit, async (c) => {
    try {
        const provider = parseProvider(c.req.param("provider"));
        if (!provider) return c.json({ error: { message: "Invalid provider" } }, 400);
        await service.delete(getCurrentUserId(c), provider);
        return c.body(null, 204);
    } catch (error) {
        return errorResponse(c, error);
    }
});

routes.put("/selection", providerMutationRateLimit, async (c) => {
    try {
        const body = (await c.req.json().catch(() => ({}))) as Partial<UpdateAISelectionRequest>;
        const provider = parseProvider(body.provider);
        if (!provider || typeof body.model !== "string") {
            return c.json({ error: { message: "Provider and model are required" } }, 400);
        }
        await service.select(
            getCurrentUserId(c),
            { provider, model: body.model },
            c.req.raw.signal
        );
        return c.json({ selection: { provider, model: body.model } });
    } catch (error) {
        return errorResponse(c, error);
    }
});

export default routes;
