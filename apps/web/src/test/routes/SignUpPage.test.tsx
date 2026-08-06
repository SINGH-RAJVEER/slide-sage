/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const signUp = mock(
	async (): Promise<{ error: { code?: string; message?: string } | null }> => ({ error: null }),
);
const sendVerificationOtp = mock(async () => ({ error: null }));

mock.module("@/contexts/AuthContext", () => ({
	useAuth: () => ({
		isSignedIn: false,
		user: null,
		signOut: async () => {},
	}),
}));

mock.module("@/lib/auth-client", () => ({
	authClient: {
		signUp: { email: signUp },
		signIn: { social: mock() },
		emailOtp: { sendVerificationOtp },
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
	const { default: SignUpPage } = await import("@/routes/SignUpPage");
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
	signUp.mockImplementationOnce(async () => ({
		error: {
			code: "EMAIL_NOT_VERIFIED",
			message: "email address is not verified",
		},
	}));
	const { default: SignUpPage } = await import("@/routes/SignUpPage");
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
