import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { originProtection } from "../../middleware/origin-protection";

function app() {
    const hono = new Hono();
    hono.use("*", originProtection);
    hono.post("/api/mutate", (c) => c.json({ success: true }));
    hono.post("/api/auth/sign-in", (c) => c.json({ success: true }));
    return hono;
}

describe("origin protection", () => {
    it("rejects unsafe requests from untrusted browser origins", async () => {
        const response = await app().request("/api/mutate", {
            method: "POST",
            headers: { Origin: "https://attacker.example" },
        });

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: { message: "Invalid request origin" } });
    });

    it("allows configured and same-origin mutations", async () => {
        const configured = await app().request(
            "http://localhost/api/mutate",
            { method: "POST", headers: { Origin: "https://app.example.com" } },
            { CORS_ORIGINS: "https://app.example.com/" }
        );
        const sameOrigin = await app().request("http://localhost/api/mutate", {
            method: "POST",
            headers: { Origin: "http://localhost" },
        });

        expect(configured.status).toBe(200);
        expect(sameOrigin.status).toBe(200);
    });

    it("rejects cross-site fetch metadata when Origin is absent", async () => {
        const response = await app().request("/api/mutate", {
            method: "POST",
            headers: { "Sec-Fetch-Site": "cross-site" },
        });

        expect(response.status).toBe(403);
    });

    it("leaves Better Auth requests to Better Auth origin validation", async () => {
        const response = await app().request("/api/auth/sign-in", {
            method: "POST",
            headers: { Origin: "https://attacker.example" },
        });

        expect(response.status).toBe(200);
    });
});
