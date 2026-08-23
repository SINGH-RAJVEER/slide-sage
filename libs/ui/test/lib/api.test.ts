import { describe, expect, it } from "bun:test";
import { normalizeApiUrl } from "../../lib/api";

describe("normalizeApiUrl", () => {
	it("preserves an origin or relative base path without adding an API prefix", () => {
		expect(normalizeApiUrl("http://localhost:8000/")).toBe("http://localhost:8000");
		expect(normalizeApiUrl("/backend/")).toBe("/backend");
		expect(normalizeApiUrl(undefined)).toBe("");
	});
});
