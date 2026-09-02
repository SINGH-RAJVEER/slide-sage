/// <reference lib="dom" />

import { beforeEach, describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

mock.module("@/contexts/AuthContext", () => ({
	useAuth: () => ({ user: null, signOut: () => Promise.resolve() }),
}));

mock.module("@slidesage/ui/components/Viewer/SlideRenderer", () => ({
	SlideRenderer: ({ slide }: { slide: { title?: string } }) => (
		<div data-testid="slide-preview">{slide.title}</div>
	),
}));

describe("MarketplacePage", () => {
	beforeEach(() => localStorage.clear());

	it("lists all 25 binary marketplace templates", async () => {
		const { default: MarketplacePage } = await import("@/routes/marketplace/MarketplacePage");
		const view = render(
			<MemoryRouter initialEntries={["/marketplace"]}>
				<MarketplacePage />
			</MemoryRouter>,
		);

		expect(view.getByText("25 templates")).toBeInTheDocument();
		expect(view.getAllByRole("button", { name: /^Preview .+ template$/ })).toHaveLength(25);
		expect(view.queryByText(/^by .+$/)).toBeNull();
		expect(view.queryByRole("button", { name: /upvote/i })).toBeNull();
	});

	it("opens a binary template ID in its preview route", async () => {
		const { default: MarketplacePage } = await import("@/routes/marketplace/MarketplacePage");
		const view = render(
			<MemoryRouter initialEntries={["/marketplace"]}>
				<Routes>
					<Route path="/marketplace" element={<MarketplacePage />} />
					<Route
						path="/marketplace/:marketplaceId/preview"
						element={<div>Binary template preview</div>}
					/>
				</Routes>
			</MemoryRouter>,
		);

		fireEvent.click(
			view.getByRole("button", {
				name: "Preview Festive Pattern Travel Agency Business Plan template",
			}),
		);
		expect(view.getByText("Binary template preview")).toBeInTheDocument();
	});

	it("does not render interactive controls inside the preview button", async () => {
		const { default: MarketplaceCard } = await import(
			"@slidesage/ui/components/Marketplace/MarketplaceCard"
		);
		const { MARKETPLACE_ITEMS } = await import("@slidesage/ui/lib/catalog");
		const item = MARKETPLACE_ITEMS[0];
		if (!item) throw new Error("Expected marketplace fixture");

		const view = render(
			<MarketplaceCard
				item={item}
				installed={false}
				onOpen={() => undefined}
				onInstall={() => undefined}
				onRemove={() => undefined}
			/>,
		);
		const preview = view.getByRole("button", { name: `Preview ${item.name} template` });
		expect(preview.querySelector("button")).toBeNull();
	});

	it("installs and removes a versioned binary reference", async () => {
		const { default: MarketplacePage } = await import("@/routes/marketplace/MarketplacePage");
		const { MARKETPLACE_ITEMS } = await import("@slidesage/ui/lib/catalog");
		const item = MARKETPLACE_ITEMS[0];
		if (!item) throw new Error("Expected marketplace fixture");
		const view = render(
			<MemoryRouter initialEntries={["/marketplace"]}>
				<MarketplacePage />
			</MemoryRouter>,
		);

		fireEvent.click(view.getByRole("button", { name: `Install ${item.name}` }));
		expect(
			JSON.parse(localStorage.getItem("slidesage-installed-marketplace-themes") || "[]"),
		).toEqual([item.templateReference]);

		fireEvent.click(view.getByRole("button", { name: `Remove ${item.name}` }));
		expect(localStorage.getItem("slidesage-installed-marketplace-themes")).toBe("[]");
	});

	it("searches binary catalog metadata", async () => {
		const { default: MarketplacePage } = await import("@/routes/marketplace/MarketplacePage");
		const view = render(
			<MemoryRouter initialEntries={["/marketplace"]}>
				<MarketplacePage />
			</MemoryRouter>,
		);

		fireEvent.input(view.getByRole("searchbox", { name: "Search marketplace" }), {
			target: { value: "A-series portrait" },
		});
		expect(view.getByText("Family Christmas Card", { selector: "h2" })).toBeInTheDocument();
		expect(view.queryByText("Hotel Sales Strategy", { selector: "h2" })).toBeNull();
	});
});
