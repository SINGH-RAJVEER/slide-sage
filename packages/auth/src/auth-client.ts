import { accounts, db, sessions, users, verifications } from "@slide-sage/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

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
    const withProtocol = /^https?:\/\//i.test(vercelUrl)
      ? vercelUrl
      : `https://${vercelUrl}`;
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
    autoSignIn: true,
  },
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
