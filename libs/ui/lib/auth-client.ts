import { API_URL } from "./api";

export interface AuthUser {
	id: string;
	name: string | null;
	email: string;
	emailVerified: boolean;
	image: string | null;
	slideTokens: number;
	createdAt: string;
	updatedAt: string;
}

export interface AuthSession {
	id: string;
	token: string;
	userId: string;
	expiresAt: string;
}

export interface EmailSignInResult {
	redirect: boolean;
	token: string;
	url: string | null;
	user: AuthUser;
}

export interface EmailSignUpResult {
	user: AuthUser;
}

export interface VerifyEmailResult {
	status: boolean;
	token: string;
	user: AuthUser;
}

export interface SocialSignInResult {
	url: string;
	redirect: boolean;
}

export interface SuccessResult {
	success: true;
}

export class AuthError extends Error {
	readonly code: string | undefined;
	readonly status: number;

	constructor(message: string, status: number, code?: string) {
		super(message);
		this.name = "AuthError";
		this.code = code;
		this.status = status;
	}
}

export function isAuthError(value: unknown): value is AuthError {
	return (
		typeof value === "object" &&
		value !== null &&
		value instanceof Error &&
		typeof (value as { code?: unknown }).code === "string"
	);
}

function extractErrorMessage(data: unknown, status: number): { message: string; code?: string } {
	if (data && typeof data === "object") {
		const body = data as Record<string, unknown>;
		if (body["error"] && typeof body["error"] === "object") {
			const detail = body["error"] as Record<string, unknown>;
			if (typeof detail["message"] === "string") {
				const code = typeof detail["code"] === "string" ? detail["code"] : undefined;
				return { message: detail["message"], code };
			}
		}
		if (typeof body["message"] === "string") {
			const code = typeof body["code"] === "string" ? body["code"] : undefined;
			return { message: body["message"], code };
		}
	}
	return { message: `Request failed with status ${status}` };
}

async function request<T>(path: string, options: { method: string; body?: unknown }): Promise<T> {
	const response = await fetch(`${API_URL}${path}`, {
		method: options.method,
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
	if (!response.ok) {
		const data = await response.json().catch(() => null);
		const { message, code } = extractErrorMessage(data, response.status);
		throw new AuthError(message, response.status, code);
	}
	return (await response.json()) as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
	return request<T>(path, { method: "POST", body });
}

export const auth = {
	signUpEmail(input: {
		name: string;
		email: string;
		password: string;
	}): Promise<EmailSignUpResult> {
		return post<EmailSignUpResult>("/auth/sign-up/email", input);
	},

	signInEmail(input: {
		email: string;
		password: string;
		rememberMe: boolean;
	}): Promise<EmailSignInResult> {
		return post<EmailSignInResult>("/auth/sign-in/email", input);
	},

	sendVerificationOtp(input: { email: string; type?: string }): Promise<SuccessResult> {
		return post<SuccessResult>("/auth/email-otp/send-verification-otp", input);
	},

	verifyEmail(input: { email: string; otp: string }): Promise<VerifyEmailResult> {
		return post<VerifyEmailResult>("/auth/email-otp/verify-email", input);
	},

	requestPasswordReset(input: { email: string }): Promise<SuccessResult> {
		return post<SuccessResult>("/auth/email-otp/request-password-reset", input);
	},

	resetPassword(input: { email: string; otp: string; password: string }): Promise<SuccessResult> {
		return post<SuccessResult>("/auth/email-otp/reset-password", input);
	},

	signOut(): Promise<SuccessResult> {
		return post<SuccessResult>("/auth/sign-out");
	},

	startSocialSignIn(
		provider: "google" | "github",
		callbackURL: string,
	): Promise<SocialSignInResult> {
		return post<SocialSignInResult>("/auth/sign-in/social", { provider, callbackURL });
	},
};
