import { describe, expect, it, mock } from "bun:test";
import { act, render, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { fetchSessionWithRetry, isSessionCheckStale } from "@/lib/session";

describe("AuthProvider", () => {
    it("only considers a checked session stale after five minutes", () => {
        const now = 1_000_000;

        expect(isSessionCheckStale(null, now)).toBe(true);
        expect(isSessionCheckStale(now - 299_999, now)).toBe(false);
        expect(isSessionCheckStale(now - 300_000, now)).toBe(true);
    });

    it("shares an in-flight session check and skips focus checks while fresh", async () => {
        const originalFetch = globalThis.fetch;
        let resolveFetch: ((response: Response) => void) | undefined;
        const fetchMock = mock(
            () =>
                new Promise<Response>((resolve) => {
                    resolveFetch = resolve;
                }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        function SessionState() {
            const { loading } = useAuth();
            return <span>{loading ? "loading" : "ready"}</span>;
        }

        try {
            const view = render(
                <AuthProvider>
                    <SessionState />
                </AuthProvider>,
            );

            expect(fetchMock).toHaveBeenCalledTimes(1);
            act(() => window.dispatchEvent(new Event("focus")));
            expect(fetchMock).toHaveBeenCalledTimes(1);

            await act(async () => {
                resolveFetch?.(
                    new Response(JSON.stringify({ user: null }), {
                        headers: { "Content-Type": "application/json" },
                    }),
                );
            });
            await waitFor(() => expect(view.getByText("ready")).toBeInTheDocument());

            act(() => window.dispatchEvent(new Event("focus")));
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it("recovers from a transient session failure before marking the user signed out", async () => {
        let callCount = 0;
        const fetchMock = mock(async () => {
            callCount += 1;
            if (callCount === 1) return new Response(null, { status: 500 });

            return new Response(
                JSON.stringify({
                    user: {
                        id: "user_1",
                        name: "Test User",
                        email: "test@example.com",
                        image: null,
                        emailVerified: true,
                        slideTokens: 50,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    },
                }),
                { headers: { "Content-Type": "application/json" } },
            );
        });
        const user = await fetchSessionWithRetry(fetchMock as unknown as typeof fetch, [0, 0, 0]);

        expect(user?.email).toBe("test@example.com");
        expect(typeof user?.createdAt).toBe("string");
        expect(typeof user?.updatedAt).toBe("string");
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenLastCalledWith(
            expect.stringContaining("/api/auth/get-session"),
            { credentials: "include" },
        );
    });
});
