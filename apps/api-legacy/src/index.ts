import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import {
	closeClientAfterResponse,
	createDatabase,
	getProcessDatabase,
	isBunRuntime,
	runWithDatabase,
} from "@/database";
import { originProtection, resolveAllowedOrigins } from "./middleware/origin-protection";
import { requestLogger } from "./middleware/request-logger";
import aiConnectionRoutes from "./routes/ai-connections.routes";
import authRoutes from "./routes/auth.routes";
import billingRoutes from "./routes/billing.routes";
import presentationRoutes from "./routes/presentation.routes";
import profileRoutes from "./routes/profile.routes";
import { takeResponseCompletion } from "./utils/response-lifecycle";
import { safeErrorProjection } from "./utils/safe-logging";

const app = new Hono();
const globalBodyLimit = bodyLimit({
	maxSize: 1024 * 1024,
	onError: (c) => c.json({ error: { message: "Request body is too large" } }, 413),
});

app.use("*", globalBodyLimit);
app.use("*", requestLogger);
app.use("*", originProtection);
app.use("*", async (c, next) => {
	const allowed = resolveAllowedOrigins((c.env ?? {}) as Record<string, string | undefined>);
	const corsHandler = cors({
		origin: (origin) => (allowed.includes(origin) ? origin : null),
		credentials: true,
		allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		maxAge: 86400,
	});
	return corsHandler(c, next);
});

app.get("/api/health", (c) => {
	return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.route("/api/auth", authRoutes);
app.route("/api/ai", aiConnectionRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api", presentationRoutes);
app.route("/api/billing", billingRoutes);

app.onError((err, c) => {
	console.error(
		JSON.stringify({
			event: "unhandled_request_error",
			method: c.req.method,
			path: new URL(c.req.url).pathname,
			error: safeErrorProjection(err),
		})
	);
	return c.json({ error: { message: "Internal server error" } }, 500);
});

app.notFound((c) => {
	return c.json({ error: { message: "Resource not found" } }, 404);
});

const port = Number.parseInt(process.env["PORT"] || "8000", 10);

interface ApiEnvironment extends Record<string, unknown> {
	DATABASE_URL?: string;
	HYPERDRIVE?: { connectionString?: string };
	NODE_ENV?: string;
}

function resolveConnectionString(env: ApiEnvironment, bunRuntime: boolean): string {
	const configured =
		env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL ?? process.env["DATABASE_URL"];
	const isProduction = (env.NODE_ENV ?? process.env["NODE_ENV"]) === "production";
	if (!configured && (isProduction || !bunRuntime)) {
		throw new Error("DATABASE_URL or HYPERDRIVE must be configured");
	}
	return configured ?? "postgresql://slidesage:slidesage@localhost:5432/slidesage";
}

function positiveEnvironmentInteger(value: unknown): number | undefined {
	if (typeof value !== "string") return undefined;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export default {
	port,
	async fetch(...args: Parameters<typeof app.fetch>) {
		const env = (args[1] ?? {}) as ApiEnvironment;
		const bunRuntime = isBunRuntime();
		const connectionString = resolveConnectionString(env, bunRuntime);
		if (bunRuntime) {
			const database = getProcessDatabase(connectionString);
			const response = await runWithDatabase(database.db, () => app.fetch(...args));
			takeResponseCompletion(response);
			return response;
		}

		const database = createDatabase(connectionString, {
			max: 1,
			connectTimeout: positiveEnvironmentInteger(env["DATABASE_CONNECT_TIMEOUT"]),
			idleTimeout: positiveEnvironmentInteger(env["DATABASE_IDLE_TIMEOUT"]),
		});
		try {
			const response = await runWithDatabase(database.db, () => app.fetch(...args));
			const completion = takeResponseCompletion(response);
			return await closeClientAfterResponse(
				response,
				() => database.client.end({ timeout: 5 }),
				completion
			);
		} catch (error) {
			await database.client.end({ timeout: 5 }).catch(() => undefined);
			throw error;
		}
	},
};
