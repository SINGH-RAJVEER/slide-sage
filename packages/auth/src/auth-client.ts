import { accounts, db, sessions, users, verifications } from "@slide-sage/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { Resend } from "resend";

export type Env = Record<string, string | undefined>;

function getEnvVar(env: Env, key: string): string | undefined {
    return env[key] ?? process.env[key];
}

let resendClient: Resend | null = null;

function getResendClient(env: Env): Resend | null {
    const apiKey = getEnvVar(env, "RESEND_API_KEY");
    if (!apiKey) return null;
    if (!resendClient) resendClient = new Resend(apiKey);
    return resendClient;
}

type OTPEmailType = "sign-in" | "email-verification" | "forget-password";

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
            intro: "We received a request to reset your Slide Sage password. Use the code below to choose a new password.",
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
        intro: "Thank you for signing up. To complete your account setup, please verify your email address using the code below:",
        label: "Your verification code is:",
        note: "This code will expire in 15 minutes. If you didn't create this account, please ignore this email.",
    };
}

async function sendOTPEmail(
    env: Env,
    email: string,
    otp: string,
    type: OTPEmailType,
    name: string,
): Promise<void> {
    const client = getResendClient(env);
    if (!client) {
        const isProduction = (getEnvVar(env, "NODE_ENV") ?? "") === "production";
        if (isProduction) {
            // Never log auth codes in production. Surface a non-sensitive error instead.
            console.error(`RESEND_API_KEY not configured; unable to send ${type} OTP to a user.`);
            throw new Error("Email service is not configured");
        }
        // Dev-only convenience: print the code so local testing works without email.
        console.warn(`[dev] RESEND_API_KEY not configured. ${type} OTP for`, email, "is:", otp);
        return;
    }

    const content = getOTPEmailContent(type, name);
    const result = await client.emails.send({
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
    if (result.error) {
        console.error("Resend API error:", result.error);
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
    const defaultOrigins = ["http://localhost:5173", "https://slide-sage.pages.dev"];
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
    const envKey = [
        getEnvVar(env, "AUTH_SECRET") ?? "",
        getEnvVar(env, "BASE_URL") ?? "",
        getEnvVar(env, "BETTER_AUTH_TRUSTED_ORIGINS") ?? "",
        getEnvVar(env, "CORS_ORIGINS") ?? "",
        getEnvVar(env, "CORS_ORIGIN") ?? "",
        getEnvVar(env, "GOOGLE_CLIENT_ID") ?? "",
        getEnvVar(env, "GOOGLE_CLIENT_SECRET") ?? "",
        getEnvVar(env, "GITHUB_CLIENT_ID") ?? "",
        getEnvVar(env, "GITHUB_CLIENT_SECRET") ?? "",
    ].join(":");
    if (cachedAuth && cachedEnvKey === envKey) return cachedAuth;

    const baseUrl = resolveBaseUrl(env);
    const trustedOrigins = resolveTrustedOrigins(env);

    cachedAuth = betterAuth({
        database: drizzleAdapter(db, {
            provider: "pg",
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
        },
        emailVerification: {
            autoSignInAfterVerification: true,
        },
        plugins: [
            emailOTP({
                otpLength: 6,
                expiresIn: 900,
                sendVerificationOnSignUp: true,
                async sendVerificationOTP({ email, otp, type }) {
                    const user = await db.query.users.findFirst({
                        where: eq(users.email, email.toLowerCase()),
                    });
                    await sendOTPEmail(env, email, otp, type, user?.name ?? "");
                },
            }),
        ],
        secret: getEnvVar(env, "AUTH_SECRET") || "your-secret-key-change-in-production",
        baseURL: baseUrl,
        trustedOrigins,
        basePath: "/api/auth",
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
