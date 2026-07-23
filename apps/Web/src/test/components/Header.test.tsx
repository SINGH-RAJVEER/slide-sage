/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { render } from "@testing-library/react";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import type { User } from "@/contexts/AuthContext";

const mockAuthState: {
    user: User | null;
    loading: boolean;
    isSignedIn: boolean;
    signOut: () => Promise<void>;
} = {
    user: null,
    loading: false,
    isSignedIn: false,
    signOut: () => Promise.resolve(),
};

mock.module("@/contexts/AuthContext", () => {
    return {
        useAuth: () => mockAuthState,
        AuthProvider: ({ children }: { children: React.ReactNode }) => children,
    };
});

describe("Header", () => {
    it("renders header component", async () => {
        mockAuthState.user = null;

        // Import after mocking AuthContext.
        const { default: Header } = await import("../../components/Header");

        const { container } = render(
            <BrowserRouter>
                <Header />
            </BrowserRouter>,
        );

        // Header should be present
        const header = container.querySelector("header");
        expect(header).toBeInTheDocument();
    });

    it("hides navigation tabs on auth pages", async () => {
        mockAuthState.user = null;

        // Import after mocking AuthContext.
        const { default: Header } = await import("../../components/Header");

        const { queryByText } = render(
            <MemoryRouter initialEntries={["/sign-in"]}>
                <Header />
            </MemoryRouter>,
        );

        expect(queryByText("Generate")).toBeNull();
        expect(queryByText("Presentations")).toBeNull();
        expect(queryByText("Marketplace")).toBeNull();
    });

    it("hides navigation tabs on nested auth pages", async () => {
        mockAuthState.user = null;

        // Import after mocking AuthContext.
        const { default: Header } = await import("../../components/Header");

        const { queryByText, rerender } = render(
            <MemoryRouter initialEntries={["/sign-in/sso-callback"]}>
                <Header />
            </MemoryRouter>,
        );

        expect(queryByText("Generate")).toBeNull();
        expect(queryByText("Presentations")).toBeNull();
        expect(queryByText("Marketplace")).toBeNull();

        rerender(
            <MemoryRouter initialEntries={["/sign-up/verify-email"]}>
                <Header />
            </MemoryRouter>,
        );

        expect(queryByText("Generate")).toBeNull();
        expect(queryByText("Presentations")).toBeNull();
        expect(queryByText("Marketplace")).toBeNull();
    });

    it("shows first and last name initials when image is missing", async () => {
        mockAuthState.user = {
            id: "user_1",
            name: "Rajveer Singh",
            email: "rajveer@example.com",
            image: null,
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            slideTokens: 10,
        };

        const { default: Header } = await import("../../components/Header");

        const { getByText } = render(
            <BrowserRouter>
                <Header />
            </BrowserRouter>,
        );

        expect(getByText("RS")).toBeInTheDocument();
    });
});
