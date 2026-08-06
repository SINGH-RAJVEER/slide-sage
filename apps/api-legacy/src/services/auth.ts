import { AsyncLocalStorage } from "node:async_hooks";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	hashPassword as hashBetterAuthPassword,
	verifyPassword as verifyBetterAuthPassword,
} from "better-auth/crypto";
import { emailOTP } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { accounts, db, sessions, users, verifications } from "@/database";
import { logSafeError } from "../utils/safe-logging";

export type Env = Record<string, string | undefined>;

const DEVELOPMENT_AUTH_SECRET = "slidesage-local-development-secret";

function getEnvVar(env: Env, key: string): string | undefined {
	return env[key] ?? process.env[key];
}

let resendClient: Resend | null = null;
const otpDeliveryFailures = new WeakSet<Request>();
const otpDeliveryRequest = new AsyncLocalStorage<Request>();

function getResendClient(env: Env): Resend | null {
	const apiKey = getEnvVar(env, "RESEND_API_KEY");
	if (!apiKey) return null;
	if (!resendClient) resendClient = new Resend(apiKey);
	return resendClient;
}

type OTPEmailType = "sign-in" | "email-verification" | "forget-password";

export function isLegacyPasswordHash(hash: string): boolean {
	return /^[a-f\d]{64}$/i.test(hash);
}

async function hashLegacyPassword(password: string): Promise<string> {
	const data = new TextEncoder().encode(password);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function constantTimeEqual(left: string, right: string): boolean {
	if (left.length !== right.length) return false;

	let difference = 0;
	for (let index = 0; index < left.length; index += 1) {
		difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return difference === 0;
}

export const hashAuthPassword = hashBetterAuthPassword;

export async function verifyAuthPassword({
	hash,
	password,
}: {
	hash: string;
	password: string;
}): Promise<boolean> {
	if (isLegacyPasswordHash(hash)) {
		const legacyHash = await hashLegacyPassword(password);
		return constantTimeEqual(legacyHash, hash.toLowerCase());
	}

	try {
		return await verifyBetterAuthPassword({ hash, password });
	} catch {
		return false;
	}
}

export function consumeOTPDeliveryFailure(request: Request): boolean {
	const failed = otpDeliveryFailures.has(request);
	otpDeliveryFailures.delete(request);
	return failed;
}

export function runWithOTPDeliveryRequest<T>(request: Request, callback: () => T): T {
	return otpDeliveryRequest.run(request, callback);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function getOTPEmailContent(type: OTPEmailType, name: string) {
	const escapedName = escapeHtml(name.trim());
	const greetingName = escapedName ? `, ${escapedName}` : "";

	if (type === "forget-password") {
		return {
			subject: "Reset your Slide Sage password",
			title: `Reset your password${greetingName}`,
			intro:
				"We received a request to reset your Slide Sage password. Use the code below to choose a new password.",
			label: "Your password reset code is:",
			note: "This code will expire in 15 minutes. If you did not request a password reset, you can safely ignore this email.",
		};
	}

	if (type === "sign-in") {
		return {
			subject: "Your Slide Sage sign-in code",
			title: `Sign in to Slide Sage${greetingName}`,
			intro: "Use the code below to finish signing in to your Slide Sage account.",
			label: "Your sign-in code is:",
			note: "This code will expire in 15 minutes. If you did not request this code, you can safely ignore this email.",
		};
	}

	return {
		subject: "Verify your Slide Sage email",
		title: `Welcome to Slide Sage${greetingName}!`,
		intro:
			"Thank you for signing up. To complete your account setup, please verify your email address using the code below:",
		label: "Your verification code is:",
		note: "This code will expire in 15 minutes. If you didn't create this account, please ignore this email.",
	};
}

export async function sendOTPEmail(
	env: Env,
	email: string,
	otp: string,
	type: OTPEmailType,
	name: string
): Promise<void> {
	const client = getResendClient(env);
	if (!client) {
		const isProduction = (getEnvVar(env, "NODE_ENV") ?? "") === "production";
		if (isProduction) {
			// Never log auth codes in production. Surface a non-sensitive error instead.
			console.error(`RESEND_API_KEY not configured; unable to send ${type} OTP to a user.`);
			throw new Error("Email service is not configured");
		}
		console.warn(`RESEND_API_KEY not configured; skipped ${type} OTP delivery in development.`);
		return;
	}

	const content = getOTPEmailContent(type, name);
	const timeoutMs = Number.parseInt(getEnvVar(env, "EMAIL_DELIVERY_TIMEOUT_MS") ?? "10000", 10);
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const delivery = client.emails.send({
		from: getEnvVar(env, "RESEND_FROM_EMAIL") || "onboarding@resend.dev",
		to: email,
		subject: content.subject,
		html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; margin-bottom: 20px;">${content.title}</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            ${content.intro}
          </p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
            <p style="margin: 0; color: #999; font-size: 14px; margin-bottom: 10px;">${content.label}</p>
            <p style="margin: 0; font-size: 36px; font-weight: bold; color: #000; letter-spacing: 5px;">${otp}</p>
          </div>
          <p style="color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
            ${content.note}
          </p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px;">© 2026 Slide Sage. All rights reserved.</p>
        </div>
      `,
	});
	const result = await Promise.race([
		delivery,
		new Promise<never>((_, reject) => {
			timeout = setTimeout(
				() => reject(new Error("Email delivery timed out")),
				Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000
			);
		}),
	]).finally(() => {
		if (timeout) clearTimeout(timeout);
	});
	if (result.error) {
		logSafeError("resend_delivery_failed", result.error);
		throw new Error("Email delivery failed");
	}
}

const normalizeBaseUrl = (url: string): string => url.trim().replace(/\/$/, "");

function resolveBaseUrl(env: Env): string {
	const explicitBaseUrl = getEnvVar(env, "BASE_URL")?.trim();
	if (explicitBaseUrl) {
		return normalizeBaseUrl(explicitBaseUrl);
	}

	const cloudflarePagesUrl = getEnvVar(env, "CF_PAGES_URL")?.trim();
	if (cloudflarePagesUrl) {
		const withProtocol = /^https?:\/\//i.test(cloudflarePagesUrl)
			? cloudflarePagesUrl
			: `https://${cloudflarePagesUrl}`;
		return normalizeBaseUrl(withProtocol);
	}

	const vercelUrl = getEnvVar(env, "VERCEL_URL")?.trim();
	if (vercelUrl) {
		const withProtocol = /^https?:\/\//i.test(vercelUrl) ? vercelUrl : `https://${vercelUrl}`;
		return normalizeBaseUrl(withProtocol);
	}

	return "http://localhost:8000";
}

function resolveTrustedOrigins(env: Env): string[] {
	const defaultOrigins = [
		"http://localhost:5173",
		"https://slidesage.pages.dev",
		"https://slidesage.app",
		"https://www.slidesage.app",
	];
	const raw = [
		getEnvVar(env, "BETTER_AUTH_TRUSTED_ORIGINS"),
		getEnvVar(env, "CORS_ORIGINS"),
		getEnvVar(env, "CORS_ORIGIN"),
	]
		.filter(Boolean)
		.join(",");
	const origins = raw
		.split(",")
		.map((s) => s.trim().replace(/\/+$/, ""))
		.filter(Boolean);
	return Array.from(new Set([...defaultOrigins, ...origins]));
}

let cachedAuth: ReturnType<typeof betterAuth> | null = null;
let cachedEnvKey = "";

export function createAuth(env: Env = {}): ReturnType<typeof betterAuth> {
	const baseUrl = resolveBaseUrl(env);
	const configuredSecret = getEnvVar(env, "AUTH_SECRET")?.trim();
	const isHttpsDeployment = baseUrl.startsWith("https://");
	const isProduction = getEnvVar(env, "NODE_ENV") === "production";
	const isPlaceholderSecret =
		configuredSecret?.startsWith("your-") || configuredSecret?.startsWith("replace-") || false;
	if (
		(isHttpsDeployment || isProduction) &&
		(!configuredSecret || configuredSecret.length < 32 || isPlaceholderSecret)
	) {
		throw new Error("AUTH_SECRET must be a non-placeholder value of at least 32 characters");
	}

	const authSecret = configuredSecret || DEVELOPMENT_AUTH_SECRET;
	const envKey = [
		authSecret,
		getEnvVar(env, "BASE_URL") ?? "",
		getEnvVar(env, "BETTER_AUTH_TRUSTED_ORIGINS") ?? "",
		getEnvVar(env, "CORS_ORIGINS") ?? "",
		getEnvVar(env, "CORS_ORIGIN") ?? "",
		getEnvVar(env, "GOOGLE_CLIENT_ID") ?? "",
		getEnvVar(env, "GOOGLE_CLIENT_SECRET") ?? "",
		getEnvVar(env, "GITHUB_CLIENT_ID") ?? "",
		getEnvVar(env, "GITHUB_CLIENT_SECRET") ?? "",
		getEnvVar(env, "RESEND_API_KEY") ?? "",
		getEnvVar(env, "RESEND_FROM_EMAIL") ?? "",
		getEnvVar(env, "NODE_ENV") ?? "",
	].join(":");
	if (cachedAuth && cachedEnvKey === envKey) return cachedAuth;

	const trustedOrigins = resolveTrustedOrigins(env);
	const usesSecureCookies = baseUrl.startsWith("https://");

	cachedAuth = betterAuth({
		database: drizzleAdapter(db, {
			provider: "pg",
			transaction: true,
			schema: {
				user: users,
				account: accounts,
				session: sessions,
				verification: verifications,
			},
		}),
		// Expose the points balance on the session user so the whole app reads a single
		// source of truth (useAuth().user) instead of separately fetched, divergent values.
		// input: false prevents clients from setting these during sign-up.
		user: {
			additionalFields: {
				slideTokens: { type: "number", input: false, required: false },
			},
		},
		emailAndPassword: {
			enabled: true,
			autoSignIn: false,
			requireEmailVerification: true,
			revokeSessionsOnPasswordReset: true,
			password: {
				hash: hashAuthPassword,
				verify: verifyAuthPassword,
			},
		},
		emailVerification: {
			autoSignInAfterVerification: true,
		},
		plugins: [
			emailOTP({
				otpLength: 6,
				expiresIn: 900,
				storeOTP: "encrypted",
				sendVerificationOnSignUp: false,
				async sendVerificationOTP({ email, otp, type }, ctx) {
					const normalizedEmail = email.trim().toLowerCase();
					try {
						const user = await db.query.users.findFirst({
							where: eq(users.email, normalizedEmail),
						});
						await sendOTPEmail(env, normalizedEmail, otp, type, user?.name ?? "");
					} catch (error) {
						const request = otpDeliveryRequest.getStore() ?? ctx?.request;
						if (request) {
							otpDeliveryFailures.add(request);
						}
						throw error;
					}
				},
			}),
		],
		secret: authSecret,
		baseURL: baseUrl,
		trustedOrigins,
		basePath: "/api/auth",
		advanced: {
			useSecureCookies: usesSecureCookies,
			defaultCookieAttributes: {
				httpOnly: true,
				secure: usesSecureCookies,
				sameSite: usesSecureCookies ? "none" : "lax",
			},
		},
		socialProviders: {
			google: {
				clientId: getEnvVar(env, "GOOGLE_CLIENT_ID") || "",
				clientSecret: getEnvVar(env, "GOOGLE_CLIENT_SECRET") || "",
				redirectURL: `${baseUrl}/api/auth/callback/google`,
			},
			github: {
				clientId: getEnvVar(env, "GITHUB_CLIENT_ID") || "",
				clientSecret: getEnvVar(env, "GITHUB_CLIENT_SECRET") || "",
				redirectURL: `${baseUrl}/api/auth/callback/github`,
			},
		},
	});

	cachedEnvKey = envKey;
	return cachedAuth;
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];

export {
	authMiddleware,
	ensureUserInDbMiddleware,
	getCurrentSessionId,
	getCurrentUserId,
} from "./auth.middleware";
