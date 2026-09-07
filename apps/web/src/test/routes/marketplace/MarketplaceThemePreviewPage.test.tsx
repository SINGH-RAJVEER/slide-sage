/// <reference lib="dom" />

import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

describe("MarketplaceThemePreviewPage", () => {
	it("previews a template with the cover rendered from its package", async () => {
		const { default: MarketplaceThemePreviewPage } = await import(
			"@/routes/marketplace/MarketplaceThemePreviewPage"
		);
		const view = render(
			<MemoryRouter initialEntries={["/marketplace/charli-xcx-brat-album-inspired/preview"]}>
				<Routes>
					<Route
						path="/marketplace/:marketplaceId/preview"
						element={<MarketplaceThemePreviewPage />}
					/>
					<Route path="/marketplace" element={<div>Marketplace catalog</div>} />
				</Routes>
			</MemoryRouter>,
		);

		const cover = await view.findByRole("img", {
			name: "Charli XCX Brat Album-Inspired cover slide",
		});
		// The cover comes from the published package, so the preview never has to
		// download the template itself.
		expect(cover.getAttribute("src")).toContain(
			encodeURIComponent("pptx-templates/charli-xcx-brat-album-inspired/1/thumbnails/cover.webp"),
		);
	});

	it("redirects unknown themes to the marketplace", async () => {
		const { default: MarketplaceThemePreviewPage } = await import(
			"@/routes/marketplace/MarketplaceThemePreviewPage"
		);
		const view = render(
			<MemoryRouter initialEntries={["/marketplace/not-a-template/preview"]}>
				<Routes>
					<Route
						path="/marketplace/:marketplaceId/preview"
						element={<MarketplaceThemePreviewPage />}
					/>
					<Route path="/marketplace" element={<div>Marketplace catalog</div>} />
				</Routes>
			</MemoryRouter>,
		);

		expect(await view.findByText("Marketplace catalog")).toBeInTheDocument();
	});
});
