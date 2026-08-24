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
	it("links the SlideSage icon to the landing page", async () => {
		mockAuthState.user = null;

		const { default: Header } = await import("@/app/Header");

		const { getByRole } = render(
			<MemoryRouter>
				<Header />
			</MemoryRouter>,
		);

		expect(getByRole("link", { name: "SlideSage — landing" })).toHaveAttribute(
			"href",
			"/landing",
		);
	});

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

	it("uses initials instead of loading a third-party profile image", async () => {
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
		const { container, getByText } = render(
			<BrowserRouter>
				<Header />
			</BrowserRouter>,
		);

		expect(getByText("RS")).toBeInTheDocument();
		expect(container.querySelector('img[src^="https://lh3.googleusercontent.com"]')).toBeNull();
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

		expect(await view.findByRole("menuitem", { name: "Settings" })).toHaveAttribute(
			"href",
			"/settings",
		);
	});
});
