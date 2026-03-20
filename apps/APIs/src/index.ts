import { config as loadEnv } from "dotenv";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import authRoutes from "./routes/auth.routes";
import billingRoutes from "./routes/billing.routes";
import presentationRoutes from "./routes/presentation.routes";
import profileRoutes from "./routes/profile.routes";

if (typeof import.meta.url === "string" && import.meta.url.startsWith("file:")) {
    loadEnv({ path: new URL("../../../.env", import.meta.url), override: false });
}

const app = new Hono();

const corsOrigins = process.env.CORS_ORIGINS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

const corsOriginConfig = corsOrigins && corsOrigins.length > 0 ? corsOrigins : "*";

app.use("*", logger());
app.use(
    "*",
    cors({
        origin: corsOriginConfig,
        credentials: true,
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
    })
);

app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.route("/api/auth", authRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api", presentationRoutes);
app.route("/api/billing", billingRoutes);

app.onError((err, c) => {
    console.error("Error:", err);
    return c.json({ error: { message: "Internal server error" } }, 500);
});

app.notFound((c) => {
    return c.json({ error: { message: "Resource not found" } }, 404);
});

const port = Number.parseInt(process.env.PORT || "8000", 10);

console.log(`Server started on port ${port}...`);

export default {
    port,
    fetch: app.fetch,
};
