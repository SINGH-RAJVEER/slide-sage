import { createDatabase, runWithDatabase } from "@slide-sage/database";
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

const DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://slide-sage.pages.dev",
    "https://slidesage.app",
];

function resolveAllowedOrigins(env: Record<string, string | undefined>): string[] {
    const raw =
        env["CORS_ORIGINS"] ??
        env["CORS_ORIGIN"] ??
        process.env["CORS_ORIGINS"] ??
        process.env["CORS_ORIGIN"] ??
        "";
    const origins = raw
        .split(",")
        .map((s) => s.trim().replace(/\/+$/, ""))
        .filter(Boolean);
    return Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...origins]));
}

app.use("*", logger());
app.use("*", async (c, next) => {
    const allowed = resolveAllowedOrigins((c.env ?? {}) as Record<string, string | undefined>);
    const corsHandler = cors({
        origin: (origin) => (allowed.includes(origin) ? origin : null),
        credentials: true,
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
        maxAge: 86400,
    });
    return corsHandler(c, next);
});

app.get("/", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.route("/api/auth", authRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api", presentationRoutes);
app.route("/api/billing", billingRoutes);

app.onError((err, c) => {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    return c.json({ error: { message: "Internal server error" } }, 500);
});

app.notFound((c) => {
    return c.json({ error: { message: "Resource not found" } }, 404);
});

const port = Number.parseInt(process.env["PORT"] || "8000", 10);

console.log(`Server started on port ${port}...`);

export default {
    port,
    fetch(...args: Parameters<typeof app.fetch>) {
        const env = (args[1] ?? {}) as Record<string, string | undefined>;
        const connectionString =
            env["DATABASE_URL"] ??
            process.env["DATABASE_URL"] ??
            "postgresql://slidesage:slidesage@localhost:5432/slidesage";
        const { db } = createDatabase(connectionString);

        return runWithDatabase(db, () => app.fetch(...args));
    },
};
