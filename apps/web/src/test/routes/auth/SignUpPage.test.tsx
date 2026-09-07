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

const signUp = mock(async () => ({ user: { id: "user_1" } }));
const sendVerificationOtp = mock(async () => ({ success: true }));

mock.module("@/contexts/AuthContext", () => ({
	useAuth: () => ({
		isSignedIn: false,
		user: null,
		signOut: async () => {},
	}),
}));

mock.module("@/lib/auth-client", () => ({
	auth: {
		signUpEmail: signUp,
		startSocialSignIn: mock(),
		sendVerificationOtp,
	},
}));

function VerificationProbe() {
	const location = useLocation();
	const params = new URLSearchParams(location.search);
	return <span>{`${params.get("email")}|${String(location.state?.deliveryError ?? "")}`}</span>;
}

it("requests a verification OTP after creating an email account", async () => {
	signUp.mockClear();
	sendVerificationOtp.mockClear();
	const { default: SignUpPage } = await import("@/routes/auth/SignUpPage");
	const view = render(
		<MemoryRouter initialEntries={["/sign-up"]}>
			<Routes>
				<Route path="/sign-up" element={<SignUpPage />} />
				<Route path="/sign-up/verify-email" element={<VerificationProbe />} />
			</Routes>
		</MemoryRouter>,
	);

	fireEvent.change(view.getByLabelText("Name"), { target: { value: "Test User" } });
	fireEvent.change(view.getByLabelText("Email"), {
		target: { value: "User@Example.com" },
	});
	fireEvent.change(view.getByLabelText("Password"), {
		target: { value: "correct-password" },
	});
	fireEvent.change(view.getByLabelText("Confirm password"), {
		target: { value: "correct-password" },
	});
	fireEvent.click(view.getByRole("button", { name: "Sign up with email" }));

	await waitFor(() => {
		expect(view.getByText("user@example.com|")).toBeInTheDocument();
	});
	expect(sendVerificationOtp).toHaveBeenCalledWith({
		email: "user@example.com",
		type: "email-verification",
	});
});

it("resends verification when the email belongs to an unverified account", async () => {
	signUp.mockClear();
	sendVerificationOtp.mockClear();
	signUp.mockImplementationOnce(async () => {
		throw new MockAuthError("email address is not verified", 409, "EMAIL_NOT_VERIFIED");
	});
	const { default: SignUpPage } = await import("@/routes/auth/SignUpPage");
	const view = render(
		<MemoryRouter initialEntries={["/sign-up"]}>
			<Routes>
				<Route path="/sign-up" element={<SignUpPage />} />
				<Route path="/sign-up/verify-email" element={<VerificationProbe />} />
			</Routes>
		</MemoryRouter>,
	);

	fireEvent.change(view.getByLabelText("Name"), { target: { value: "Test User" } });
	fireEvent.change(view.getByLabelText("Email"), { target: { value: "User@Example.com" } });
	fireEvent.change(view.getByLabelText("Password"), { target: { value: "correct-password" } });
	fireEvent.change(view.getByLabelText("Confirm password"), {
		target: { value: "correct-password" },
	});
	fireEvent.click(view.getByRole("button", { name: "Sign up with email" }));

	await waitFor(() => {
		expect(view.getByText("user@example.com|")).toBeInTheDocument();
	});
	expect(sendVerificationOtp).toHaveBeenCalledWith({
		email: "user@example.com",
		type: "email-verification",
	});
});

it("shows the orb loader when switching to sign in", async () => {
	const { default: SignUpPage } = await import("@/routes/auth/SignUpPage");
	const view = render(
		<MemoryRouter initialEntries={["/sign-up"]}>
			<SignUpPage />
		</MemoryRouter>,
	);

	const switchLink = view.getByRole("link", { name: "Sign in" });
	expect(switchLink.getAttribute("href")).toBe("/sign-in");

	fireEvent.click(switchLink);

	expect(view.getByLabelText("Loading sign in")).toBeInTheDocument();
});

it("preserves redirect_url when switching to sign in", async () => {
	const { default: SignUpPage } = await import("@/routes/auth/SignUpPage");
	const view = render(
		<MemoryRouter initialEntries={["/sign-up?redirect_url=%2Fgenerate"]}>
			<Routes>
				<Route path="/sign-up" element={<SignUpPage />} />
			</Routes>
		</MemoryRouter>,
	);

	expect(view.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
		"/sign-in?redirect_url=%2Fgenerate",
	);
});
