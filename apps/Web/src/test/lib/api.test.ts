import { describe, expect, it } from "bun:test";
import { normalizeApiUrl, readJsonResponse, resolveApiUrl } from "@/lib/api";

describe("normalizeApiUrl", () => {
    it("adds HTTPS to a bare deployed API hostname", () => {
        expect(normalizeApiUrl("slide-sage.therajveersingh.workers.dev")).toBe(
            "https://slide-sage.therajveersingh.workers.dev",
        );
    });

    it("preserves explicit protocols and removes trailing slashes", () => {
        expect(normalizeApiUrl("https://api.example.com///")).toBe("https://api.example.com");
        expect(normalizeApiUrl("http://api.example.com/")).toBe("http://api.example.com");
    });

    it("uses HTTP for a bare local development address", () => {
        expect(normalizeApiUrl("localhost:8000/")).toBe("http://localhost:8000");
        expect(normalizeApiUrl("127.0.0.1:8000")).toBe("http://127.0.0.1:8000");
    });

    it("preserves empty and relative API URLs", () => {
        expect(normalizeApiUrl(undefined)).toBe("");
        expect(normalizeApiUrl("/backend/")).toBe("/backend");
    });
});

describe("resolveApiUrl", () => {
    it("uses same-origin API routes when production receives a loopback URL", () => {
        expect(resolveApiUrl("http://localhost:8000", true)).toBe("");
        expect(resolveApiUrl("http://127.0.0.1:8000", true)).toBe("");
        expect(resolveApiUrl("http://0.0.0.0:8000", true)).toBe("");
        expect(resolveApiUrl("http://[::1]:8000", true)).toBe("");
    });

    it("preserves loopback URLs during development", () => {
        expect(resolveApiUrl("http://localhost:8000", false)).toBe("http://localhost:8000");
    });

    it("preserves deployed and relative production API URLs", () => {
        expect(resolveApiUrl("https://api.slidesage.app", true)).toBe("https://api.slidesage.app");
        expect(resolveApiUrl("/backend", true)).toBe("/backend");
    });

    it("uses same-origin API routes on the production custom domain", () => {
        expect(
            resolveApiUrl("https://api.slidesage.app", true, "https://slidesage.app/profile"),
        ).toBe("");
        expect(
            resolveApiUrl("https://api.slidesage.app", true, "https://www.slidesage.app/profile"),
        ).toBe("");
    });

    it("uses same-origin API routes on the custom domain despite an incorrect build mode", () => {
        expect(resolveApiUrl("http://localhost:8000", false, "https://slidesage.app/sign-in")).toBe(
            "",
        );
    });

    it("keeps the deployed API origin for Cloudflare Pages previews", () => {
        expect(
            resolveApiUrl(
                "https://api.slidesage.app",
                true,
                "https://slide-sage.pages.dev/profile",
            ),
        ).toBe("https://api.slidesage.app");
    });
});

describe("readJsonResponse", () => {
    it("returns null when a deployment returns HTML", async () => {
        const response = new Response("<!DOCTYPE html><title>Bad gateway</title>", {
            status: 502,
            headers: { "Content-Type": "text/html" },
        });

        expect(await readJsonResponse(response)).toBeNull();
    });
});
