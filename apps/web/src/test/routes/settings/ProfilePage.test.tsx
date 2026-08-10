/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const refreshSession = mock(async () => {});

mock.module("@/contexts/AuthContext", () => ({
	useAuth: () => ({
		user: null,
		refreshSession,
		signOut: async () => {},
	}),
}));

function VerificationProbe() {
	const location = useLocation();
	const params = new URLSearchParams(location.search);
	return (
		<span>{`${params.get("email")}|${params.get("redirect_url")}|${params.get("mode")}`}</span>
	);
}

it("sends a pending email change to its verification route", async () => {
	refreshSession.mockClear();
	const originalFetch = globalThis.fetch;
	const originalUser = {
		id: "user_1",
		name: "Test User",
		email: "old@example.com",
		image: null,
		emailVerified: true,
		slideTokens: 50,
		createdAt: "2026-07-14T10:00:00.000Z",
	};

	globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
		if (init?.method === "PUT") {
			return Response.json({
				user: originalUser,
				pending_email: "new@example.com",
				verification_required: true,
			});
		}

		return Response.json({ user: originalUser });
	}) as unknown as typeof fetch;

	try {
		const { default: ProfilePage } = await import("@/routes/settings/ProfilePage");
		const view = render(
			<MemoryRouter initialEntries={["/profile"]}>
				<Routes>
					<Route path="/profile" element={<ProfilePage />} />
					<Route path="/sign-up/verify-email" element={<VerificationProbe />} />
				</Routes>
			</MemoryRouter>,
		);

		await view.findByText("old@example.com");
		const editButtons = view.getAllByRole("button", { name: "Edit" });
		fireEvent.click(editButtons[1] as HTMLButtonElement);
		fireEvent.change(view.getByDisplayValue("old@example.com"), {
			target: { value: "new@example.com" },
		});
		fireEvent.change(view.getByPlaceholderText("Current password"), {
			target: { value: "current-password" },
		});
		fireEvent.click(view.getByRole("button", { name: "Save" }));

		await waitFor(() => {
			expect(view.getByText("new@example.com|/profile|email-change")).toBeInTheDocument();
		});
		expect(refreshSession).not.toHaveBeenCalled();
	} finally {
		globalThis.fetch = originalFetch;
	}
});
