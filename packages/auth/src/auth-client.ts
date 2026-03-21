import { accounts, db, sessions, users, verifications } from "@slide-sage/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

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
    autoSignIn: true,
  },
  secret: process.env.AUTH_SECRET || "your-secret-key-change-in-production",
  baseURL: process.env.BASE_URL || "http://localhost:8000",
  trustedOrigins,
  basePath: "/api/auth",
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirectURL: `${process.env.BASE_URL || "http://localhost:8000"}/api/auth/callback/google`,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      redirectURL: `${process.env.BASE_URL || "http://localhost:8000"}/api/auth/callback/github`,
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
