/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
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

		const { default: Header } = await import("@/app/Header");

		const { container } = render(
			<BrowserRouter>
				<Header />
			</BrowserRouter>,
		);

		// Header should be present
		const header = container.querySelector("header");
		expect(header).toBeInTheDocument();
		expect(header?.firstElementChild).toHaveClass("h-16");
		expect(header?.firstElementChild).not.toHaveClass("md:h-20");
	});

	it("hides navigation tabs on auth pages", async () => {
		mockAuthState.user = null;

		const { default: Header } = await import("@/app/Header");

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

		const { default: Header } = await import("@/app/Header");

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
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			slideTokens: 10,
		};

		const { default: Header } = await import("@/app/Header");

		const { getByText } = render(
			<BrowserRouter>
				<Header />
			</BrowserRouter>,
		);

		expect(getByText("RS")).toBeInTheDocument();
	});

	it("renders the saved profile picture", async () => {
		mockAuthState.user = {
			id: "user_1",
			name: "Rajveer Singh",
			email: "rajveer@example.com",
			image: "https://lh3.googleusercontent.com/a/profile=s96-c",
			emailVerified: true,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			slideTokens: 10,
		};

		const { default: Header } = await import("@/app/Header");
		const { container, queryByText } = render(
			<BrowserRouter>
				<Header />
			</BrowserRouter>,
		);

		expect(queryByText("RS")).toBeNull();
		expect(
			container.querySelector('img[src="https://lh3.googleusercontent.com/a/profile=s96-c"]'),
		).toBeInTheDocument();
	});

	it("links to settings from the account menu", async () => {
		mockAuthState.user = {
			id: "user_1",
			name: "Rajveer Singh",
			email: "rajveer@example.com",
			image: null,
			emailVerified: true,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			slideTokens: 10,
		};

		const { default: Header } = await import("@/app/Header");
		const view = render(
			<MemoryRouter initialEntries={["/generate"]}>
				<Header />
			</MemoryRouter>,
		);

		fireEvent.pointerDown(view.getByRole("button", { name: "Open account menu" }), {
			button: 0,
			ctrlKey: false,
		});

		const profile = await view.findByRole("menuitem", { name: "Profile" });
		const settings = await view.findByRole("menuitem", { name: "Settings" });
		const signOut = await view.findByRole("menuitem", { name: "Sign Out" });
		expect(settings).toHaveAttribute("href", "/settings");
		for (const item of [profile, settings, signOut]) {
			expect(item.querySelector("svg")).not.toBeNull();
		}
	});
});
