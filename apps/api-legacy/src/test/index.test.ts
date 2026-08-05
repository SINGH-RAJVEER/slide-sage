import { afterAll, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { closeProcessDatabases } from "../database";

function emptyRoutes() {
    return new Hono();
}

mock.module("../routes/auth.routes", () => ({ default: emptyRoutes() }));
mock.module("../routes/billing.routes", () => ({ default: emptyRoutes() }));
mock.module("../routes/presentation.routes", () => ({ default: emptyRoutes() }));
mock.module("../routes/profile.routes", () => ({ default: emptyRoutes() }));

const server = (await import("../index")).default;

afterAll(closeProcessDatabases);

describe("API app", () => {
    it("returns health status at /api/health", async () => {
        const response = await server.fetch(new Request("http://localhost/api/health"));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.status).toBe("ok");
        expect(typeof body.timestamp).toBe("string");
    });

    it("does not expose the health status at the root", async () => {
        const response = await server.fetch(new Request("http://localhost/"));

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: { message: "Resource not found" } });
    });

    it("returns a structured 404 for unknown routes", async () => {
        const response = await server.fetch(new Request("http://localhost/missing"));

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: { message: "Resource not found" } });
    });

    it("mounts the protected AI configuration routes", async () => {
        const response = await server.fetch(new Request("http://localhost/api/ai/config"));

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: { message: "Unauthorized" } });
    });

    it("applies CORS for configured allowed origins with trailing slashes", async () => {
        const response = await server.fetch(
            new Request("http://localhost/api/health", {
                headers: { Origin: "https://app.example.com" },
            }),
            { CORS_ORIGINS: "https://app.example.com/" }
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
        expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    });

    it("allows the production frontend origins by default", async () => {
        for (const origin of [
            "https://slidesage.pages.dev",
            "https://slidesage.app",
            "https://www.slidesage.app",
        ]) {
            const response = await server.fetch(
                new Request("http://localhost/", {
                    method: "OPTIONS",
                    headers: {
                        Origin: origin,
                        "Access-Control-Request-Method": "POST",
                        "Access-Control-Request-Headers": "content-type",
                    },
                })
            );

            expect(response.status).toBe(204);
            expect(response.headers.get("access-control-allow-origin")).toBe(origin);
            expect(response.headers.get("access-control-allow-credentials")).toBe("true");
        }
    });

    it("allows browser PATCH preflights with authorization headers", async () => {
        const response = await server.fetch(
            new Request("http://localhost/api/presentations/presentation_1", {
                method: "OPTIONS",
                headers: {
                    Origin: "https://slidesage.app",
                    "Access-Control-Request-Method": "PATCH",
                    "Access-Control-Request-Headers": "authorization,content-type",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Site": "same-site",
                },
            })
        );

        expect(response.status).toBe(204);
        expect(response.headers.get("access-control-allow-methods")).toContain("PATCH");
        expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain(
            "authorization"
        );
    });
});
