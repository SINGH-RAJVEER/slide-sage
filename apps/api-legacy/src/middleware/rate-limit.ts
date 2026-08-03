import { sql } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { db } from "@/database";
import { logSafeError } from "../utils/safe-logging";

export interface RateLimitPolicy {
    scope: string;
    limit: number;
    windowSeconds: number;
    identity: (c: Context) => string | null | Promise<string | null>;
}

export interface RateLimitConsumption {
    scope: string;
    keyHash: string;
    windowStart: Date;
    expiresAt: Date;
}

export type RateLimitStore = (input: RateLimitConsumption) => Promise<number>;

export async function hashRateLimitKey(
    scope: string,
    identity: string,
    secret = ""
): Promise<string> {
    const value = new TextEncoder().encode(`${secret}\0${scope}\0${identity}`);
    const digest = await crypto.subtle.digest("SHA-256", value);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

export async function consumeRateLimit(input: RateLimitConsumption): Promise<number> {
    const result = await db.execute<{ requestCount: number }>(sql`
        WITH expired AS (
            DELETE FROM api_rate_limits
            WHERE expires_at < NOW()
            RETURNING 1
        )
        INSERT INTO api_rate_limits (scope, key_hash, window_start, request_count, expires_at)
        VALUES (${input.scope}, ${input.keyHash}, ${input.windowStart}, 1, ${input.expiresAt})
        ON CONFLICT (scope, key_hash, window_start)
        DO UPDATE SET
            request_count = api_rate_limits.request_count + 1,
            expires_at = EXCLUDED.expires_at
        RETURNING request_count AS "requestCount"
    `);
    const row = result[0] as { requestCount?: number } | undefined;
    return Number(row?.requestCount ?? 1);
}

function rateLimitSecret(c: Context): string {
    const env = (c.env ?? {}) as Record<string, string | undefined>;
    const dedicated = env["RATE_LIMIT_HASH_SECRET"] ?? process.env["RATE_LIMIT_HASH_SECRET"];
    const isProduction = (env["NODE_ENV"] ?? process.env["NODE_ENV"]) === "production";
    if (isProduction && !dedicated) {
        throw new Error("RATE_LIMIT_HASH_SECRET is required in production");
    }
    return dedicated ?? env["AUTH_SECRET"] ?? process.env["AUTH_SECRET"] ?? "development";
}

export function clientAddress(c: Context): string {
    const runtime = (c.env ?? {}) as {
        requestIP?: (request: Request) => { address?: string } | null;
        TRUST_PROXY_HEADERS?: string;
    };
    const directAddress = runtime.requestIP?.(c.req.raw)?.address?.trim();
    if (directAddress) return directAddress.slice(0, 128);

    const isBun = "Bun" in globalThis;
    const trustProxyHeaders = runtime.TRUST_PROXY_HEADERS === "true";
    if (isBun && !trustProxyHeaders) return "unknown";

    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    return (
        c.req.header("cf-connecting-ip")?.trim() ||
        forwarded ||
        c.req.header("x-real-ip")?.trim() ||
        "unknown"
    ).slice(0, 128);
}

export async function requestEmail(c: Context): Promise<string | null> {
    const body = (await c.req.raw
        .clone()
        .json()
        .catch(() => null)) as { email?: unknown } | null;
    if (typeof body?.email !== "string") return null;
    const email = body.email.trim().toLowerCase();
    return email ? email.slice(0, 320) : null;
}

export function authenticatedUser(c: Context): string | null {
    const userId = c.get("userId") as string | undefined;
    return userId || null;
}

export function rateLimit(
    policies: RateLimitPolicy[],
    store: RateLimitStore = consumeRateLimit
): MiddlewareHandler {
    return async (c, next) => {
        if (c.req.method === "OPTIONS") {
            await next();
            return;
        }

        const now = Date.now();
        for (const policy of policies) {
            const identity = await policy.identity(c);
            if (!identity) continue;

            const windowMs = policy.windowSeconds * 1000;
            const windowStartMs = Math.floor(now / windowMs) * windowMs;
            const expiresAtMs = windowStartMs + windowMs;
            let count: number;
            try {
                count = await store({
                    scope: policy.scope,
                    keyHash: await hashRateLimitKey(policy.scope, identity, rateLimitSecret(c)),
                    windowStart: new Date(windowStartMs),
                    expiresAt: new Date(expiresAtMs),
                });
            } catch (error) {
                logSafeError("rate_limit_store_failed", error);
                return c.json(
                    {
                        error: {
                            message: "Request protection is temporarily unavailable",
                            code: "RATE_LIMIT_UNAVAILABLE",
                        },
                    },
                    503
                );
            }

            if (count > policy.limit) {
                const retryAfter = Math.max(1, Math.ceil((expiresAtMs - now) / 1000));
                c.header("Retry-After", String(retryAfter));
                return c.json(
                    {
                        error: {
                            message: "Too many requests",
                            code: "RATE_LIMITED",
                        },
                        retry_after: retryAfter,
                    },
                    429
                );
            }
        }

        await next();
    };
}

export function userRateLimit(
    scope: string,
    limit: number,
    windowSeconds: number
): MiddlewareHandler {
    return rateLimit([{ scope, limit, windowSeconds, identity: authenticatedUser }]);
}
