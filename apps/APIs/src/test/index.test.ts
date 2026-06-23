import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

function emptyRoutes() {
    return new Hono();
}

mock.module("../routes/auth.routes", () => ({ default: emptyRoutes() }));
mock.module("../routes/billing.routes", () => ({ default: emptyRoutes() }));
mock.module("../routes/presentation.routes", () => ({ default: emptyRoutes() }));
mock.module("../routes/profile.routes", () => ({ default: emptyRoutes() }));

const server = (await import("../index")).default;

describe("API app", () => {
    it("returns health status at the root", async () => {
        const response = await server.fetch(new Request("http://localhost/"));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.status).toBe("ok");
        expect(typeof body.timestamp).toBe("string");
    });

    it("returns a structured 404 for unknown routes", async () => {
        const response = await server.fetch(new Request("http://localhost/missing"));

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: { message: "Resource not found" } });
    });

    it("applies CORS for configured allowed origins", async () => {
        const response = await server.fetch(
            new Request("http://localhost/", {
                headers: { Origin: "https://app.example.com" },
            }),
            { CORS_ORIGINS: "https://app.example.com" }
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
        expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    });
});
