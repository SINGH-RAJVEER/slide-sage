import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { API_URL } from "@/lib/api";

function getAuthBaseURL() {
    const apiOrigin =
        API_URL ||
        (typeof window !== "undefined" ? window.location.origin : "http://localhost:5173");
    return `${apiOrigin}/auth`;
}

export const authClient = createAuthClient({
    baseURL: getAuthBaseURL(),
    plugins: [emailOTPClient()],
    fetchOptions: {
        credentials: "include",
    },
});
