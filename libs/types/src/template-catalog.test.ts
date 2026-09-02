import { describe, expect, it } from "bun:test";
import { BINARY_PPTX_TEMPLATE_CATALOG, buildBinaryTemplateUrl } from "./template-catalog";

describe("binary PPTX template catalog", () => {
	it("contains six default and 25 marketplace templates", () => {
		expect(
			BINARY_PPTX_TEMPLATE_CATALOG.filter((entry) => entry.availability === "default"),
		).toHaveLength(6);
		expect(
			BINARY_PPTX_TEMPLATE_CATALOG.filter((entry) => entry.availability === "marketplace"),
		).toHaveLength(25);
	});

	it("uses the selected general-purpose templates as defaults", () => {
		expect(
			BINARY_PPTX_TEMPLATE_CATALOG.filter((entry) => entry.availability === "default").map(
				(entry) => entry.id,
			),
		).toEqual([
			"5s-training",
			"modern-minimal-grid-financial-management",
			"minimalist-marketing-annual-report",
			"simple-business-proposal",
			"simple-performance-review",
			"soft-skills-training",
		]);
	});

	it("uses stable IDs as unique source filenames", () => {
		const ids = BINARY_PPTX_TEMPLATE_CATALOG.map((entry) => entry.id);
		const sourceFilenames = BINARY_PPTX_TEMPLATE_CATALOG.map((entry) => entry.sourceFilename);

		expect(new Set(ids).size).toBe(BINARY_PPTX_TEMPLATE_CATALOG.length);
		expect(new Set(sourceFilenames).size).toBe(BINARY_PPTX_TEMPLATE_CATALOG.length);
		expect(ids.every((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))).toBe(true);
		expect(sourceFilenames).toEqual(
			BINARY_PPTX_TEMPLATE_CATALOG.map((entry) => `${entry.id}.pptx`),
		);
	});

	it("constructs an encoded URL from the configured public base URL", () => {
		const entry = {
			asset: { status: "pending-upload" as const, path: "templates/v1/sample deck.pptx" },
		};

		expect(buildBinaryTemplateUrl("https://cdn.example.com/public", entry)).toBe(
			"https://cdn.example.com/public/templates/v1/sample%20deck.pptx",
		);
		expect(buildBinaryTemplateUrl("https://cdn.example.com/public/", entry)).toBe(
			"https://cdn.example.com/public/templates/v1/sample%20deck.pptx",
		);
	});

	it("records version and onboarding state without invented hashes", () => {
		for (const entry of BINARY_PPTX_TEMPLATE_CATALOG) {
			expect(entry.version).toBe(1);
			expect(entry.asset).not.toHaveProperty("sha256");
		}
		expect(
			BINARY_PPTX_TEMPLATE_CATALOG.filter((entry) => entry.asset.status === "available").map(
				(entry) => entry.id,
			),
		).toEqual(["simple-business-proposal"]);
	});
});
