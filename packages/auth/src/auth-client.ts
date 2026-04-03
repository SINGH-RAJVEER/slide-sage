import { accounts, db, sessions, users, verifications } from "@slide-sage/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
    if (!process.env.RESEND_API_KEY) return null;
    if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
    return resendClient;
}

async function sendOTPEmail(email: string, otp: string, name: string): Promise<void> {
    const client = getResendClient();
    if (!client) {
        console.warn("RESEND_API_KEY not configured. OTP for", email, "is:", otp);
        return;
    }
    const result = await client.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
        to: email,
        subject: "Verify your Slide Sage email",
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; margin-bottom: 20px;">Welcome to Slide Sage${name ? `, ${name}` : ""}! </h1>
          <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Thank you for signing up. To complete your account setup, please verify your email address using the code below:
          </p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
            <p style="margin: 0; color: #999; font-size: 14px; margin-bottom: 10px;">Your verification code is:</p>
            <p style="margin: 0; font-size: 36px; font-weight: bold; color: #000; letter-spacing: 5px;">${otp}</p>
          </div>
          <p style="color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
            This code will expire in 15 minutes. If you didn't create this account, please ignore this email.
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

const resolveBaseUrl = (): string => {
    const explicitBaseUrl = process.env.BASE_URL?.trim();
    if (explicitBaseUrl) {
        return normalizeBaseUrl(explicitBaseUrl);
    }

    const cloudflarePagesUrl = process.env.CF_PAGES_URL?.trim();
    if (cloudflarePagesUrl) {
        const withProtocol = /^https?:\/\//i.test(cloudflarePagesUrl)
            ? cloudflarePagesUrl
            : `https://${cloudflarePagesUrl}`;
        return normalizeBaseUrl(withProtocol);
    }

    const vercelUrl = process.env.VERCEL_URL?.trim();
    if (vercelUrl) {
        const withProtocol = /^https?:\/\//i.test(vercelUrl) ? vercelUrl : `https://${vercelUrl}`;
        return normalizeBaseUrl(withProtocol);
    }

    return "http://localhost:8000";
};

const baseUrl = resolveBaseUrl();

const trustedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
          .map((value) => value.trim())
          .filter(Boolean)
    : ["http://localhost:5173", "http://127.0.0.1:5173"];

const authClient = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: {
            user: users,
            account: accounts,
            session: sessions,
            verification: verifications,
        },
    }),
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
                if (type === "email-verification") {
                    const user = await db.query.users.findFirst({
                        where: eq(users.email, email),
                    });
                    await sendOTPEmail(email, otp, user?.name ?? "");
                }
            },
        }),
    ],
    secret: process.env.AUTH_SECRET || "your-secret-key-change-in-production",
    baseURL: baseUrl,
    trustedOrigins,
    basePath: "/api/auth",
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
            redirectURL: `${baseUrl}/api/auth/callback/google`,
        },
        github: {
            clientId: process.env.GITHUB_CLIENT_ID || "",
            clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
            redirectURL: `${baseUrl}/api/auth/callback/github`,
        },
    },
    callbacks: {
        async session(session: unknown) {
            return session;
        },
        async signUp(data: unknown) {
            return data;
        },
    },
});

export default authClient;
export type Session = typeof authClient.$Infer.Session;
