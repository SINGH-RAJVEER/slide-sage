/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

const sendVerificationOtp = mock(async () => ({ error: null }));
const verifyEmail = mock(async () => ({ error: null }));
const refreshSession = mock(async () => {});

mock.module("@/lib/auth-client", () => {
    return {
        authClient: {
            emailOtp: {
                sendVerificationOtp,
                verifyEmail,
            },
        },
    };
});

mock.module("@/contexts/AuthContext", () => {
    return {
        useAuth: () => ({
            isSignedIn: false,
            user: null,
            refreshSession,
        }),
        AuthProvider: ({ children }: { children: ReactNode }) => children,
    };
});

describe("VerifyEmailPage", () => {
    it("completes an email change through the profile verification endpoint", async () => {
        const originalFetch = globalThis.fetch;
        const fetchMock = mock(async () => Response.json({ user: { id: "user_1" } }));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        refreshSession.mockClear();
        verifyEmail.mockClear();

        try {
            const { default: VerifyEmailPage } = await import("@/routes/VerifyEmailPage");
            const view = render(
                <MemoryRouter
                    initialEntries={[
                        "/sign-up/verify-email?email=new%40example.com&redirect_url=%2Fprofile&mode=email-change",
                    ]}
                >
                    <VerifyEmailPage />
                </MemoryRouter>,
            );

            fireEvent.change(view.getByLabelText("Verification Code"), {
                target: { value: "123456" },
            });
            fireEvent.click(view.getByRole("button", { name: "Verify Email" }));

            await waitFor(() => {
                expect(fetchMock).toHaveBeenCalledWith(
                    expect.stringContaining("/api/profile/email/verify"),
                    expect.objectContaining({
                        method: "POST",
                        body: JSON.stringify({
                            email: "new@example.com",
                            otp: "123456",
                        }),
                    }),
                );
            });
            expect(refreshSession).toHaveBeenCalledWith({ force: true });
            expect(verifyEmail).not.toHaveBeenCalled();
            expect(view.queryByRole("button", { name: "Resend Code" })).toBeNull();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it("starts a resend cooldown instead of showing a browser alert or success message", async () => {
        const alertMock = mock(() => {});
        const originalAlert = globalThis.alert;
        globalThis.alert = alertMock as typeof alert;

        try {
            const { default: VerifyEmailPage } = await import("@/routes/VerifyEmailPage");

            const view = render(
                <MemoryRouter
                    initialEntries={["/sign-up/verify-email?email=rajveer%40example.com"]}
                >
                    <VerifyEmailPage />
                </MemoryRouter>,
            );

            fireEvent.click(view.getByRole("button", { name: "Resend Code" }));

            await waitFor(() => {
                expect(sendVerificationOtp).toHaveBeenCalledTimes(1);
            });

            expect(alertMock).not.toHaveBeenCalled();
            expect(view.queryByText("A new verification code was sent to your email.")).toBeNull();
            expect(view.getByRole("button", { name: "Resend Code in 30s" })).toBeDisabled();
        } finally {
            globalThis.alert = originalAlert;
        }
    });
});
