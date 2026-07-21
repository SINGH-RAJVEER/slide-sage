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
