/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";

const refreshSession = mock(async () => {});
const authState = {
	user: null as null | { landingPage?: "generate" | "presentations" },
};

mock.module("@/contexts/AuthContext", () => ({
	useAuth: () => ({
		user: authState.user,
		loading: false,
		isSignedIn: authState.user !== null,
		refreshSession,
		signOut: async () => {},
	}),
}));

const putBody: Array<string | undefined> = [];

const { LandingPreference } = await import("@/routes/settings/LandingPreference");

function selectTrigger(view: ReturnType<typeof render>) {
	return view.getByRole("combobox", { name: "Default landing page" });
}

it("saves the picked default page and refreshes the session", async () => {
	authState.user = { landingPage: "generate" };
	const originalFetch = globalThis.fetch;
	globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
		if (init?.method === "PUT") {
			putBody.push(String(init.body));
			return Response.json({ user: { ...authState.user, landingPage: "presentations" } });
		}
		return Response.json({ user: authState.user });
	}) as unknown as typeof fetch;

	try {
		const view = render(<LandingPreference />);
		fireEvent.click(selectTrigger(view));
		fireEvent.click(view.getByRole("option", { name: "Presentations" }));

		await waitFor(() => expect(putBody).toHaveLength(1));
		expect(JSON.parse(putBody[0] ?? "{}")).toEqual({ landingPage: "presentations" });
		expect(refreshSession).toHaveBeenCalledWith({ force: true });
	} finally {
		globalThis.fetch = originalFetch;
	}
});

it("shows an error on a floating indicator and rolls back when the save fails", async () => {
	authState.user = { landingPage: "generate" };
	const originalFetch = globalThis.fetch;
	globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
		if (init?.method === "PUT") {
			return Response.json({ error: { message: "Not signed in" } }, { status: 401 });
		}
		return Response.json({ user: authState.user });
	}) as unknown as typeof fetch;

	try {
		const view = render(<LandingPreference />);
		fireEvent.click(selectTrigger(view));
		fireEvent.click(view.getByRole("option", { name: "Presentations" }));

		expect(await view.findByRole("alert")).toHaveTextContent("Not signed in");
		expect(selectTrigger(view)).toHaveTextContent("Generate");
	} finally {
		globalThis.fetch = originalFetch;
	}
});

it("confirms a saved change on the floating indicator", async () => {
	authState.user = { landingPage: "presentations" };
	const originalFetch = globalThis.fetch;
	globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
		if (init?.method === "PUT") {
			return Response.json({ user: { ...authState.user, landingPage: "generate" } });
		}
		return Response.json({ user: authState.user });
	}) as unknown as typeof fetch;

	try {
		const view = render(<LandingPreference />);
		fireEvent.click(selectTrigger(view));
		fireEvent.click(view.getByRole("option", { name: "Generate" }));

		expect(await view.findByRole("status")).toHaveTextContent("Default page updated.");
	} finally {
		globalThis.fetch = originalFetch;
	}
});
