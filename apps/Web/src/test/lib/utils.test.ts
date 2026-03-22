import { describe, expect, it } from "bun:test";
import { getApiBaseUrl } from "@/lib/utils";

describe("getApiBaseUrl", () => {
    it("returns empty string when value is undefined", () => {
        expect(getApiBaseUrl(undefined)).toBe("");
    });

    it("keeps full http and https URLs", () => {
        expect(getApiBaseUrl("http://localhost:8000/")).toBe("http://localhost:8000");
        expect(getApiBaseUrl("https://api.example.com///")).toBe("https://api.example.com");
    });

    it("converts protocol-relative URLs to https", () => {
        expect(getApiBaseUrl("//api.example.com")).toBe("https://api.example.com");
    });

    it("converts bare hostnames to absolute https URLs", () => {
        expect(getApiBaseUrl("slide-sage.therajveersingh.workers.dev")).toBe(
            "https://slide-sage.therajveersingh.workers.dev",
        );
        expect(getApiBaseUrl("api.example.com:8787")).toBe("https://api.example.com:8787");
    });

    it("returns empty string for docker-internal api host", () => {
        expect(getApiBaseUrl("http://apis:8000")).toBe("");
    });
});
