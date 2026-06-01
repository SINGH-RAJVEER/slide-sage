import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { API_URL } from "@/lib/api";

export const authClient = createAuthClient({
    baseURL: `${API_URL}/api/auth`,
    plugins: [emailOTPClient()],
    fetchOptions: {
        credentials: "include",
    },
});
