import { db } from "@slide-sage/db";
import { accounts, sessions, users, verifications } from "@slide-sage/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

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
        autoSignIn: true,
    },
    secret: process.env.AUTH_SECRET || "your-secret-key-change-in-production",
    baseURL: process.env.AUTH_URL || "http://localhost:8000",
    trustedOrigins: process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(",")
        : ["http://localhost:5173"],
    basePath: "/api/auth",
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
            redirectURL: `${process.env.AUTH_URL || "http://localhost:8000"}/api/auth/callback/google`,
        },
        github: {
            clientId: process.env.GITHUB_CLIENT_ID || "",
            clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
            redirectURL: `${process.env.AUTH_URL || "http://localhost:8000"}/api/auth/callback/github`,
        },
    },
    emailVerification: {
        required: false,
        sendVerificationEmail: async (user, url) => {},
    },
    callbacks: {
        // Called after successful OAuth sign-in
        async session(session) {
            // You can add custom logic here
            return session;
        },
        async signUp(data) {
            // Initialize user with default tokens
            if (data.user) {
                // User will be created with default tokens from schema
            }
            return data;
        },
    },
});

export default authClient;
export type Session = typeof authClient.$Infer.Session;
export type User = typeof authClient.$Infer.User;
