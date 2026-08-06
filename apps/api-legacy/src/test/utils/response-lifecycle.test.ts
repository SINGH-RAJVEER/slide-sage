import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { takeResponseCompletion, trackedStream } from "../../utils/response-lifecycle";

describe("response lifecycle", () => {
	it("tracks stream cleanup when middleware wraps the response", async () => {
		const app = new Hono();
		app.use("*", cors());
		app.get("/stream", (c) =>
			trackedStream(c, async (stream) => {
				await stream.write("data: complete\n\n");
			})
		);
		const request = new Request("http://localhost/stream", {
			headers: { Origin: "https://slidesage.app" },
		});

		const response = await app.fetch(request);
		const completion = takeResponseCompletion(response);

		expect(completion).toBeInstanceOf(Promise);
		await response.text();
		await completion;
	});

	it("preserves tracking when body limiting replaces a chunked POST request", async () => {
		const app = new Hono();
		app.use("*", bodyLimit({ maxSize: 1024 }));
		app.use("*", cors());
		app.post("/stream", async (c) => {
			await c.req.text();
			return trackedStream(c, async (stream) => {
				await stream.write("data: complete\n\n");
			});
		});
		const requestInit: RequestInit & { duplex: "half" } = {
			method: "POST",
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("chunked body"));
					controller.close();
				},
			}),
			duplex: "half",
			headers: { Origin: "https://slidesage.app" },
		};
		const request = new Request("http://localhost/stream", requestInit);

		const response = await app.fetch(request);
		const completion = takeResponseCompletion(response);

		expect(completion).toBeInstanceOf(Promise);
		expect(response.headers.has("x-slidesage-response-completion")).toBe(false);
		await response.text();
		await completion;
	});
});
