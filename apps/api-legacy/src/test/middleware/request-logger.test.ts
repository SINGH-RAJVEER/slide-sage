import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { requestLogger } from "../../middleware/request-logger";

describe("request logger", () => {
	it("logs the pathname without query parameters", async () => {
		const originalInfo = console.info;
		const info = mock();
		console.info = info;
		try {
			const app = new Hono();
			app.use("*", requestLogger);
			app.get("/search", (c) => c.json({ ok: true }));

			const response = await app.request("/search?query=private-content&api_key=secret");

			expect(response.status).toBe(200);
			expect(info).toHaveBeenCalledTimes(1);
			const logged = String(info.mock.calls[0]?.[0]);
			expect(logged).toContain('"path":"/search"');
			expect(logged).not.toContain("private-content");
			expect(logged).not.toContain("secret");
		} finally {
			console.info = originalInfo;
		}
	});
});
