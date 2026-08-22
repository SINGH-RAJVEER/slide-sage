/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
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
	it("opens the selected theme in its dedicated preview route", async () => {
		const { default: MarketplacePage } = await import("@/routes/marketplace/MarketplacePage");

		const { getByRole, getByText } = render(
			<MemoryRouter initialEntries={["/marketplace"]}>
				<Routes>
					<Route path="/marketplace" element={<MarketplacePage />} />
					<Route
						path="/marketplace/:marketplaceId/preview"
						element={<div>Dedicated theme preview</div>}
					/>
				</Routes>
			</MemoryRouter>,
		);

		fireEvent.click(getByRole("button", { name: "Preview Neon District theme" }));

		expect(getByText("Dedicated theme preview")).toBeInTheDocument();
	});

	it("does not render interactive controls inside the preview button", async () => {
		mock.restore();
		const { default: MarketplaceCard } = await import(
			"@slidesage/ui/components/Marketplace/MarketplaceCard"
		);
		const { MARKETPLACE_ITEMS } = await import("@/modules/marketplace/catalog");
		const item = MARKETPLACE_ITEMS[0];
		if (!item) throw new Error("Expected marketplace fixture");

		const { getByRole } = render(
			<MarketplaceCard
				item={item}
				voted={false}
				installed={false}
				onOpen={() => undefined}
				onVote={() => undefined}
				onInstall={() => undefined}
				onRemove={() => undefined}
			/>,
		);
		const preview = getByRole("button", { name: `Preview ${item.name} theme` });

		expect(preview.querySelector("button")).toBeNull();
	});

	it("adds a marketplace theme to the installed collection", async () => {
		localStorage.clear();
		const { default: MarketplacePage } = await import("@/routes/marketplace/MarketplacePage");
		const { getByRole } = render(
			<MemoryRouter initialEntries={["/marketplace"]}>
				<MarketplacePage />
			</MemoryRouter>,
		);

		fireEvent.click(getByRole("button", { name: "Add theme Neon District" }));

		expect(getByRole("button", { name: "Remove Neon District" })).toBeEnabled();
		expect(localStorage.getItem("slidesage-installed-marketplace-themes")).toContain(
			"neon-district",
		);
	});

	it("removes a marketplace theme from the installed collection", async () => {
		localStorage.setItem("slidesage-installed-marketplace-themes", '["neon-district"]');
		const { default: MarketplacePage } = await import("@/routes/marketplace/MarketplacePage");
		const { getByRole } = render(
			<MemoryRouter initialEntries={["/marketplace"]}>
				<MarketplacePage />
			</MemoryRouter>,
		);

		fireEvent.click(getByRole("button", { name: "Remove Neon District" }));

		expect(getByRole("button", { name: "Add theme Neon District" })).toBeInTheDocument();
		expect(localStorage.getItem("slidesage-installed-marketplace-themes")).toBe("[]");
	});

	it("shows themes only and toggles an upvote", async () => {
		localStorage.removeItem("slidesage-marketplace-votes:anonymous");
		const { default: MarketplacePage } = await import("@/routes/marketplace/MarketplacePage");
		const { getByRole, queryByText } = render(
			<MemoryRouter initialEntries={["/marketplace"]}>
				<MarketplacePage />
			</MemoryRouter>,
		);

		expect(queryByText("Neon District", { selector: "h2" })).toBeInTheDocument();

		const voteButton = getByRole("button", { name: "Upvote Neon District" });
		expect(voteButton).not.toHaveClass("bg-blue-500/20");
		fireEvent.click(voteButton);
		expect(getByRole("button", { name: "Remove upvote from Neon District" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(getByRole("button", { name: "Remove upvote from Neon District" })).toHaveClass(
			"bg-blue-500/20",
		);
	});

	it("searches creator and design metadata", async () => {
		const { default: MarketplacePage } = await import("@/routes/marketplace/MarketplacePage");
		const { getByRole, queryByText } = render(
			<MemoryRouter initialEntries={["/marketplace"]}>
				<MarketplacePage />
			</MemoryRouter>,
		);

		fireEvent.input(getByRole("searchbox", { name: "Search marketplace" }), {
			target: { value: "Gold" },
		});

		expect(queryByText("Velvet Marquee", { selector: "h2" })).toBeInTheDocument();
		expect(queryByText("Concrete Brutal", { selector: "h2" })).toBeNull();
	});

	it("lists every marketplace offering with its own creator identity", async () => {
		const { default: MarketplacePage } = await import("@/routes/marketplace/MarketplacePage");
		const { getAllByText, getByText } = render(
			<MemoryRouter initialEntries={["/marketplace"]}>
				<MarketplacePage />
			</MemoryRouter>,
		);

		expect(getByText("Neon District", { selector: "h2" })).toBeInTheDocument();
		expect(getByText("Draft Board", { selector: "h2" })).toBeInTheDocument();
		expect(getByText("Velvet Marquee", { selector: "h2" })).toBeInTheDocument();
		expect(getByText("Bubblegum Pop", { selector: "h2" })).toBeInTheDocument();
		expect(getByText("Concrete Brutal", { selector: "h2" })).toBeInTheDocument();
		expect(getByText("Terra Mesa", { selector: "h2" })).toBeInTheDocument();
		expect(getAllByText(/^by .+$/)).toHaveLength(6);
	});
});
