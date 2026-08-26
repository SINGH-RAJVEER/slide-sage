/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const authState = {
	user: null as { landingPage?: "generate" | "presentations" } | null,
};

mock.module("@/contexts/AuthContext", () => ({
	useAuth: () => ({
		user: authState.user,
		loading: false,
		isSignedIn: authState.user !== null,
		refreshSession: async () => {},
		signOut: async () => {},
	}),
}));

const { default: HomePage } = await import("@/routes/presentations/HomePage");

function renderHome() {
	return render(
		<MemoryRouter initialEntries={["/"]}>
			<Routes>
				<Route path="/" element={<HomePage />} />
				<Route path="/generate" element={<div>Generate page</div>} />
				<Route path="/presentations" element={<div>Presentation library</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("HomePage", () => {
	it("routes to generate by default when no preference is stored", async () => {
		authState.user = {};

		const view = renderHome();

		expect(await view.findByText("Generate page")).toBeInTheDocument();
	});

	it("routes to presentations when the user picked it as their default page", async () => {
		authState.user = { landingPage: "presentations" };

		const view = renderHome();

		expect(await view.findByText("Presentation library")).toBeInTheDocument();
	});

	it("routes to generate when the user explicitly picked generate", async () => {
		authState.user = { landingPage: "generate" };

		const view = renderHome();

		expect(await view.findByText("Generate page")).toBeInTheDocument();
	});
});
