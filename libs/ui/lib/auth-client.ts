import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { API_URL } from "./api";

function getAuthBaseURL() {
	const apiOrigin = API_URL || "http://localhost:8000";
	return `${apiOrigin}/auth`;
}

export const authClient = createAuthClient({
	baseURL: getAuthBaseURL(),
	plugins: [emailOTPClient()],
	fetchOptions: {
		credentials: "include",
	},
});
