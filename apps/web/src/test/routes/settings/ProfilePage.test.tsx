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

it("updates the profile picture automatically after entering an image URL", async () => {
	refreshSession.mockClear();
	const originalFetch = globalThis.fetch;
	const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
	const user = {
		id: "user_1",
		name: "Test User",
		email: "old@example.com",
		image: null,
		emailVerified: true,
		slideTokens: 50,
		createdAt: "2026-07-14T10:00:00.000Z",
	};

	globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ input, init });
		if (String(input).endsWith("/profile/avatar") && init?.method === "POST") {
			return Response.json({
				user: { id: user.id, image: "https://example.com/avatar.png" },
			});
		}
		return Response.json({ user });
	}) as unknown as typeof fetch;

	try {
		const { default: ProfilePage } = await import("@/routes/settings/ProfilePage");
		const view = render(
			<MemoryRouter initialEntries={["/profile"]}>
				<Routes>
					<Route path="/profile" element={<ProfilePage />} />
				</Routes>
			</MemoryRouter>,
		);

		await view.findByText("old@example.com");
		expect(view.queryByRole("button", { name: "Update Picture" })).not.toBeInTheDocument();
		fireEvent.change(view.getByLabelText("Image URL"), {
			target: { value: "https://example.com/avatar.png" },
		});

		await waitFor(
			() => {
				expect(
					calls.some(
						({ input, init }) =>
							String(input).endsWith("/profile/avatar") && init?.method === "POST",
					),
				).toBe(true);
			},
			{ timeout: 3000 },
		);
		const avatarCall = calls.find(
			({ input, init }) => String(input).endsWith("/profile/avatar") && init?.method === "POST",
		);
		expect(JSON.parse(String(avatarCall?.init?.body))).toEqual({
			imageUrl: "https://example.com/avatar.png",
		});
		await view.findByText(/Profile picture updated/);
		expect(refreshSession).toHaveBeenCalled();
	} finally {
		globalThis.fetch = originalFetch;
	}
});

it("uploads a local profile picture from the folder button", async () => {
	refreshSession.mockClear();
	const originalFetch = globalThis.fetch;
	const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
	const user = {
		id: "user_1",
		name: "Test User",
		email: "old@example.com",
		image: null,
		emailVerified: true,
		slideTokens: 50,
		createdAt: "2026-07-14T10:00:00.000Z",
	};

	globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ input, init });
		if (String(input).endsWith("/profile/avatar/upload") && init?.method === "POST") {
			return Response.json({
				user: { id: user.id, image: "https://api.example.com/profile/avatar/image/avatar_1" },
			});
		}
		return Response.json({ user });
	}) as unknown as typeof fetch;

	try {
		const { default: ProfilePage } = await import("@/routes/settings/ProfilePage");
		const view = render(
			<MemoryRouter initialEntries={["/profile"]}>
				<Routes>
					<Route path="/profile" element={<ProfilePage />} />
				</Routes>
			</MemoryRouter>,
		);

		await view.findByText("old@example.com");
		fireEvent.click(view.getByRole("button", { name: "Upload profile picture from your device" }));
		const input = view.container.querySelector<HTMLInputElement>("#avatar-file");
		if (!input) throw new Error("file input was not rendered");
		const file = new File(
			[new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
			"avatar.png",
			{ type: "image/png" },
		);
		Object.defineProperty(input, "files", { configurable: true, value: [file] });
		fireEvent.change(input);

		await waitFor(() => {
			expect(
				calls.some(
					({ input: requestInput, init }) =>
						String(requestInput).endsWith("/profile/avatar/upload") && init?.method === "POST",
				),
			).toBe(true);
		});
		const uploadCall = calls.find(({ input: requestInput }) =>
			String(requestInput).endsWith("/profile/avatar/upload"),
		);
		if (!(uploadCall?.init?.body instanceof FormData)) {
			throw new Error("avatar upload did not send multipart form data");
		}
		expect(uploadCall.init.body.get("file")).toBe(file);
		await view.findByText(/Profile picture updated/);
		expect(refreshSession).toHaveBeenCalled();
	} finally {
		globalThis.fetch = originalFetch;
	}
});
