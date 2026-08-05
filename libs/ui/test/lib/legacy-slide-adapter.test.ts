import { describe, expect, it } from "bun:test";
import type { LegacyHtmlSlide } from "@slidesage/types";
import { adaptLegacyHtmlSlide } from "@slidesage/ui/lib/legacy-slide-adapter";

function legacySlide(html: string): LegacyHtmlSlide {
	return {
		id: "legacy-slide",
		type: "content",
		html,
		transition: { type: "fade" },
		effects: [{ id: "reveal", type: "fade-in" }],
	};
}

describe("adaptLegacyHtmlSlide", () => {
	it("converts supported markup into typed blocks and drops unsafe content", () => {
		const adapted = adaptLegacyHtmlSlide(
			legacySlide(`
                <div id="slide-content" class="layout-image-right">
                    <h2 id="slide-title">Migration plan</h2>
                    <p id="slide-subtitle">A safe structured slide</p>
                    <ul><li>Inventory</li><li>Move</li></ul>
                    <table>
                        <thead><tr><th>Owner</th><th>Status</th></tr></thead>
                        <tbody><tr><td>Design</td><td>Ready</td></tr></tbody>
                    </table>
                    <img src="https://example.com/diagram.png" alt="System diagram">
                    <img src="javascript:alert(1)" alt="Unsafe image">
                    <script>globalThis.compromised = true</script>
                </div>
            `),
		);

		expect(adapted).toMatchObject({
			id: "legacy-slide",
			type: "content",
			layout: "media-right",
			title: "Migration plan",
			subtitle: "A safe structured slide",
			transition: { type: "fade" },
			effects: [{ id: "reveal", type: "fade-in" }],
		});
		expect(adapted.blocks.map((block) => block.type)).toEqual(["bullets", "table", "image"]);
		expect(adapted.blocks.every((block) => block.id && block.sourceIds?.length === 0)).toBe(true);
		expect(adapted.blocks.filter((block) => block.type === "image")).toHaveLength(1);
	});

	it("maps two-column content into primary and secondary regions", () => {
		const adapted = adaptLegacyHtmlSlide(
			legacySlide(`
                <div id="slide-content" class="layout-two-col">
                    <h2>Comparison</h2>
                    <div class="two-column">
                        <div class="column"><p>Current state</p></div>
                        <div class="column"><p>Target state</p></div>
                    </div>
                </div>
            `),
		);

		expect(adapted.layout).toBe("split");
		expect(adapted.blocks).toEqual([
			expect.objectContaining({
				type: "paragraph",
				region: "primary",
				text: "Current state",
			}),
			expect.objectContaining({
				type: "paragraph",
				region: "secondary",
				text: "Target state",
			}),
		]);
	});

	it("uses a stable fallback title and caps the exported block count", () => {
		const paragraphs = Array.from(
			{ length: 20 },
			(_, index) => `<p>Paragraph ${index + 1}</p>`,
		).join("");
		const adapted = adaptLegacyHtmlSlide(
			legacySlide(`<div id="slide-content">${paragraphs}</div>`),
		);

		expect(adapted.title).toBe("Untitled Slide");
		expect(adapted.blocks).toHaveLength(12);
		expect(adapted.blocks.at(-1)).toMatchObject({ text: "Paragraph 12" });
	});
});
