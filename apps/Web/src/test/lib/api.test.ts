import { describe, expect, it } from "bun:test";
import { normalizeApiUrl } from "@/lib/api";

describe("normalizeApiUrl", () => {
    it("adds HTTPS to a bare deployed API hostname", () => {
        expect(normalizeApiUrl("slide-sage.therajveersingh.workers.dev")).toBe(
            "https://slide-sage.therajveersingh.workers.dev"
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
