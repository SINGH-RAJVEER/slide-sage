import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { getApiBaseUrl } from "@/lib/utils";

const apiBase = getApiBaseUrl(import.meta.env.VITE_API_URL);

export const authClient = createAuthClient({
    baseURL: apiBase ? `${apiBase}/api/auth` : "/api/auth",
    plugins: [emailOTPClient()],
    fetchOptions: {
        credentials: "include",
    },
});
