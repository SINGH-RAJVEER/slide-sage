/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const authState = {
	isSignedIn: false,
	loading: false,
};

mock.module("@/contexts/AuthContext", () => ({
	useAuth: () => authState,
}));

const { default: RequireSignedInLayout } = await import("@/app/router/RequireSignedInLayout");

function CurrentLocation() {
	const location = useLocation();
	return <output aria-label="Current location">{`${location.pathname}${location.search}`}</output>;
}

function renderGuard(initialEntry = "/private") {
	return render(
		<MemoryRouter initialEntries={[initialEntry]}>
			<Routes>
				<Route element={<RequireSignedInLayout />}>
					<Route path="/private" element={<div>Private content</div>} />
				</Route>
				<Route path="/sign-in" element={<CurrentLocation />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("RequireSignedInLayout", () => {
	it("shows a session loading state before deciding access", () => {
		authState.loading = true;
		authState.isSignedIn = false;

		const view = renderGuard();

		expect(view.getByRole("status", { name: "Checking session" })).toBeInTheDocument();
		expect(view.queryByText("Private content")).toBeNull();
	});

	it("renders protected content for a signed-in user", () => {
		authState.loading = false;
		authState.isSignedIn = true;

		const view = renderGuard();

		expect(view.getByText("Private content")).toBeInTheDocument();
	});

	it("redirects signed-out users and preserves path, query, and hash", () => {
		authState.loading = false;
		authState.isSignedIn = false;

		const view = renderGuard("/private?tab=recent#details");
		const location = view.getByLabelText("Current location").textContent || "";
		const search = new URLSearchParams(location.split("?")[1]);

		expect(location.startsWith("/sign-in?")).toBe(true);
		expect(search.get("redirect_url")).toBe("/private?tab=recent#details");
	});
});
