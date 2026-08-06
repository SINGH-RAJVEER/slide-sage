import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { clientAddress, rateLimit, requestEmail } from "../../middleware/rate-limit";

describe("rate limit middleware", () => {
	it("hashes email and IP identities and returns a structured 429", async () => {
		const counts = new Map<string, number>();
		const consumed: Array<{ scope: string; keyHash: string }> = [];
		const store = mock(async (input: { scope: string; keyHash: string }) => {
			consumed.push(input);
			const key = `${input.scope}:${input.keyHash}`;
			const count = (counts.get(key) ?? 0) + 1;
			counts.set(key, count);
			return count;
		});
		const limiter = rateLimit(
			[
				{
					scope: "test:email",
					limit: 1,
					windowSeconds: 60,
					identity: requestEmail,
				},
				{
					scope: "test:ip",
					limit: 10,
					windowSeconds: 60,
					identity: clientAddress,
				},
			],
			store
		);
		const app = new Hono();
		app.post("/limited", limiter, (c) => c.json({ ok: true }));
		const request = () =>
			app.request("/limited", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"CF-Connecting-IP": "203.0.113.10",
				},
				body: JSON.stringify({ email: " User@Example.com " }),
			});

		expect((await request()).status).toBe(200);
		const response = await request();

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toMatch(/^\d+$/);
		expect(await response.json()).toEqual({
			error: { message: "Too many requests", code: "RATE_LIMITED" },
			retry_after: expect.any(Number),
		});
		expect(consumed[0]?.keyHash).toMatch(/^[a-f0-9]{64}$/);
		expect(JSON.stringify(consumed)).not.toContain("user@example.com");
		expect(JSON.stringify(consumed)).not.toContain("203.0.113.10");
	});

	it("bypasses OPTIONS without touching the store", async () => {
		const store = mock(() => Promise.resolve(100));
		const app = new Hono();
		app.use(
			"*",
			rateLimit([{ scope: "test", limit: 1, windowSeconds: 60, identity: clientAddress }], store)
		);
		app.options("/limited", (c) => c.body(null, 204));

		const response = await app.request("/limited", { method: "OPTIONS" });

		expect(response.status).toBe(204);
		expect(store).not.toHaveBeenCalled();
	});

	it("fails closed when the shared store is unavailable", async () => {
		const app = new Hono();
		app.post(
			"/limited",
			rateLimit(
				[{ scope: "test", limit: 1, windowSeconds: 60, identity: () => "user_1" }],
				async () => {
					throw new Error("database unavailable");
				}
			),
			(c) => c.json({ ok: true })
		);

		const response = await app.request("/limited", { method: "POST" });
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			error: {
				message: "Request protection is temporarily unavailable",
				code: "RATE_LIMIT_UNAVAILABLE",
			},
		});
	});
});
