import { describe, expect, it, mock } from "bun:test";
import { fetchSessionWithRetry } from "@/lib/session";

describe("AuthProvider", () => {
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
                { headers: { "Content-Type": "application/json" } }
            );
        });
        const user = await fetchSessionWithRetry(fetchMock as typeof fetch, [0, 0, 0]);

        expect(user?.email).toBe("test@example.com");
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenLastCalledWith(
            expect.stringContaining("/api/auth/get-session"),
            { credentials: "include" }
        );
    });
});
