/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const signIn = mock(async () => ({
	error: {
		code: "EMAIL_NOT_VERIFIED",
		message: "email address is not verified",
	},
}));
const sendVerificationOtp = mock(async () => ({ error: null }));

mock.module("@/contexts/AuthContext", () => ({
	useAuth: () => ({
		isSignedIn: false,
		refreshSession: mock(),
		user: null,
	}),
}));

mock.module("@/lib/auth-client", () => ({
	authClient: {
		signIn: { email: signIn, social: mock() },
		emailOtp: { sendVerificationOtp },
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
