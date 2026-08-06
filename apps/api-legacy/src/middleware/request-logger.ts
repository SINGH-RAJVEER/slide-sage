import type { MiddlewareHandler } from "hono";

export const requestLogger: MiddlewareHandler = async (c, next) => {
	const startedAt = Date.now();

	try {
		await next();
	} finally {
		console.info(
			JSON.stringify({
				event: "http_request",
				method: c.req.method,
				path: new URL(c.req.url).pathname,
				status: c.res.status,
				duration_ms: Date.now() - startedAt,
			})
		);
	}
};
