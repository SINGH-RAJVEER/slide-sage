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
        const { default: MarketplacePage } = await import("@/modules/pages/MarketplacePage");

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

        fireEvent.click(getByRole("button", { name: "Preview Midnight Signal theme" }));

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
            />,
        );
        const preview = getByRole("button", { name: `Preview ${item.name} theme` });

        expect(preview.querySelector("button")).toBeNull();
    });

    it("adds a marketplace theme to the installed collection", async () => {
        localStorage.clear();
        const { default: MarketplacePage } = await import("@/modules/pages/MarketplacePage");
        const { getByRole } = render(
            <MemoryRouter initialEntries={["/marketplace"]}>
                <MarketplacePage />
            </MemoryRouter>,
        );

        fireEvent.click(getByRole("button", { name: "Add theme Midnight Signal" }));

        expect(getByRole("button", { name: "Added Midnight Signal" })).toBeDisabled();
        expect(localStorage.getItem("slidesage-installed-marketplace-themes")).toContain(
            "midnight-signal",
        );
    });

    it("shows themes only and toggles an upvote", async () => {
        const { default: MarketplacePage } = await import("@/modules/pages/MarketplacePage");
        const { getByRole, queryByText } = render(
            <MemoryRouter initialEntries={["/marketplace"]}>
                <MarketplacePage />
            </MemoryRouter>,
        );

        expect(queryByText("Midnight Signal", { selector: "h2" })).toBeInTheDocument();
        expect(queryByText("Split Decision", { selector: "h2" })).toBeNull();

        const voteButton = getByRole("button", { name: "Upvote Midnight Signal" });
        fireEvent.click(voteButton);
        expect(getByRole("button", { name: "Remove upvote from Midnight Signal" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    it("searches creator and design metadata", async () => {
        const { default: MarketplacePage } = await import("@/modules/pages/MarketplacePage");
        const { getByRole, queryByText } = render(
            <MemoryRouter initialEntries={["/marketplace"]}>
                <MarketplacePage />
            </MemoryRouter>,
        );

        fireEvent.input(getByRole("searchbox", { name: "Search marketplace" }), {
            target: { value: "Serif" },
        });

        expect(queryByText("Founder Letter", { selector: "h2" })).toBeInTheDocument();
        expect(queryByText("Boardroom Clear", { selector: "h2" })).toBeNull();
    });

    it("lists every marketplace theme as authored by SlideSage", async () => {
        const { default: MarketplacePage } = await import("@/modules/pages/MarketplacePage");
        const { getAllByText, getByText } = render(
            <MemoryRouter initialEntries={["/marketplace"]}>
                <MarketplacePage />
            </MemoryRouter>,
        );

        expect(getByText("Citrus Brief", { selector: "h2" })).toBeInTheDocument();
        expect(getByText("Paper Grid", { selector: "h2" })).toBeInTheDocument();
        expect(getAllByText("by SlideSage")).toHaveLength(6);
    });
});
