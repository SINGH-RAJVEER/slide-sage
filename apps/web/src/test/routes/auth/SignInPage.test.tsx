/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

class MockAuthError extends Error {
	readonly status: number;
	readonly code: string | undefined;

	constructor(message: string, status: number, code?: string) {
		super(message);
		this.name = "AuthError";
		this.status = status;
		this.code = code;
	}
}

const signIn = mock(async () => {
	throw new MockAuthError("email address is not verified", 401, "EMAIL_NOT_VERIFIED");
});
const sendVerificationOtp = mock(async () => ({ success: true }));

mock.module("@/contexts/AuthContext", () => ({
	useAuth: () => ({
		isSignedIn: false,
		refreshSession: mock(),
		user: null,
	}),
}));

mock.module("@/lib/auth-client", () => ({
	auth: {
		signInEmail: signIn,
		startSocialSignIn: mock(),
		sendVerificationOtp,
	},
}));

function VerificationProbe() {
	const location = useLocation();
	const params = new URLSearchParams(location.search);
	return <span>{params.get("email")}</span>;
}

it("resends verification when an unverified user signs in", async () => {
	signIn.mockClear();
	sendVerificationOtp.mockClear();
	const { default: SignInPage } = await import("@/routes/auth/SignInPage");
	const view = render(
		<MemoryRouter initialEntries={["/sign-in"]}>
			<Routes>
				<Route path="/sign-in" element={<SignInPage />} />
				<Route path="/sign-up/verify-email" element={<VerificationProbe />} />
			</Routes>
		</MemoryRouter>,
	);

	fireEvent.change(view.getByLabelText("Email"), { target: { value: "User@Example.com" } });
	fireEvent.change(view.getByLabelText("Password"), { target: { value: "correct-password" } });
	fireEvent.click(view.getByRole("button", { name: "Sign in with email" }));

	await waitFor(() => {
		expect(view.getByText("user@example.com")).toBeInTheDocument();
	});
	expect(sendVerificationOtp).toHaveBeenCalledWith({
		email: "user@example.com",
		type: "email-verification",
	});
});

it("shows the orb loader when switching to sign up", async () => {
	const { default: SignInPage } = await import("@/routes/auth/SignInPage");
	const view = render(
		<MemoryRouter initialEntries={["/sign-in"]}>
			<SignInPage />
		</MemoryRouter>,
	);

	const switchLink = view.getByRole("link", { name: "Sign up" });
	expect(switchLink.getAttribute("href")).toBe("/sign-up");

	fireEvent.click(switchLink);

	expect(view.getByLabelText("Loading sign up")).toBeInTheDocument();
});

it("preserves redirect_url when switching to sign up", async () => {
	const { default: SignInPage } = await import("@/routes/auth/SignInPage");
	const view = render(
		<MemoryRouter initialEntries={["/sign-in?redirect_url=%2Fgenerate"]}>
			<Routes>
				<Route path="/sign-in" element={<SignInPage />} />
			</Routes>
		</MemoryRouter>,
	);

	expect(view.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe(
		"/sign-up?redirect_url=%2Fgenerate",
	);
});
