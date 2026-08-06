import type { MiddlewareHandler } from "hono";

const DEFAULT_CORS_ORIGINS = [
	"http://localhost:5173",
	"http://127.0.0.1:5173",
	"https://slidesage.pages.dev",
	"https://slidesage.app",
	"https://www.slidesage.app",
];

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function resolveAllowedOrigins(env: Record<string, string | undefined>): string[] {
	const raw =
		env["CORS_ORIGINS"] ??
		env["CORS_ORIGIN"] ??
		process.env["CORS_ORIGINS"] ??
		process.env["CORS_ORIGIN"] ??
		"";
	const configured = raw
		.split(",")
		.map((origin) => origin.trim().replace(/\/+$/, ""))
		.filter(Boolean);
	return Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...configured]));
}

export const originProtection: MiddlewareHandler = async (c, next) => {
	if (!unsafeMethods.has(c.req.method)) {
		await next();
		return;
	}

	const url = new URL(c.req.url);
	if (url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/")) {
		await next();
		return;
	}

	const origin = c.req.header("origin")?.replace(/\/+$/, "");
	if (origin) {
		const allowed = resolveAllowedOrigins((c.env ?? {}) as Record<string, string | undefined>);
		if (origin !== url.origin && !allowed.includes(origin)) {
			return c.json({ error: { message: "Invalid request origin" } }, 403);
		}
	} else if (c.req.header("sec-fetch-site") === "cross-site") {
		return c.json({ error: { message: "Invalid request origin" } }, 403);
	}

	await next();
};
