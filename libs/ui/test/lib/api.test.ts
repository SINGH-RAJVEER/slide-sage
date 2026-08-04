import { describe, expect, it } from "bun:test";
import { normalizeApiUrl } from "../../lib/api";

describe("normalizeApiUrl", () => {
    it("removes the legacy API path prefix from configured origins", () => {
        expect(normalizeApiUrl("https://api.slidesage.app/api")).toBe("https://api.slidesage.app");
        expect(normalizeApiUrl("api.slidesage.app/api/")).toBe("https://api.slidesage.app");
    });

    it("preserves an origin or relative base path without adding an API prefix", () => {
        expect(normalizeApiUrl("http://localhost:8000/")).toBe("http://localhost:8000");
        expect(normalizeApiUrl("/backend/")).toBe("/backend");
        expect(normalizeApiUrl(undefined)).toBe("");
    });
});
