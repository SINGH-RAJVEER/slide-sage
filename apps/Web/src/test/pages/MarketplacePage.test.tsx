/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

mock.module("@/contexts/AuthContext", () => ({
    useAuth: () => ({ user: null, signOut: () => Promise.resolve() }),
}));

mock.module("@/components/Viewer/SlideRenderer", () => ({
    SlideRenderer: ({ slide }: { slide: { title?: string } }) => (
        <div data-testid="slide-preview">{slide.title}</div>
    ),
}));

describe("MarketplacePage", () => {
    it("opens a theme sample presentation in the viewer route", async () => {
        const { default: MarketplacePage } = await import("@/modules/pages/MarketplacePage");
        function ViewerState() {
            const location = useLocation();
            const presentation = location.state?.presentation;
            return <div>{`${presentation?.title}|${presentation?.slides.length}`}</div>;
        }

        const { getByRole, getByText } = render(
            <MemoryRouter initialEntries={["/marketplace"]}>
                <Routes>
                    <Route path="/marketplace" element={<MarketplacePage />} />
                    <Route path="/presentation" element={<ViewerState />} />
                </Routes>
            </MemoryRouter>,
        );

        fireEvent.click(getByRole("button", { name: "Preview Midnight Signal theme" }));

        expect(getByText("Midnight Signal theme preview|4")).toBeInTheDocument();
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
            target: { value: "Studio North" },
        });

        expect(queryByText("Founder Letter", { selector: "h2" })).toBeInTheDocument();
        expect(queryByText("Boardroom Clear", { selector: "h2" })).toBeNull();
    });
});
