import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
    process.env.DATABASE_URL || "postgresql://slidesage:slidesage@localhost:5432/slidesage";

function resolveSSL(connectionString: string): "require" | false {
    const lowerConnectionString = connectionString.toLowerCase();
    if (
        lowerConnectionString.includes("sslmode=disable") ||
        lowerConnectionString.includes("ssl=false")
    ) {
        return false;
    }
    if (
        lowerConnectionString.includes("sslmode=require") ||
        lowerConnectionString.includes("ssl=require") ||
        lowerConnectionString.includes("ssl=true")
    ) {
        return "require";
    }

    try {
        const host = new URL(connectionString).hostname;
        if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
            return false;
        }
        return "require";
    } catch {
        return false;
    }
}

function resolveConnectTimeout(): number {
    const timeout = Number.parseInt(process.env.DATABASE_CONNECT_TIMEOUT ?? "10", 10);
    return Number.isFinite(timeout) && timeout > 0 ? timeout : 10;
}

export const client = postgres(connectionString, {
    ssl: resolveSSL(connectionString),
    connect_timeout: resolveConnectTimeout(),
    connection: {
        application_name: "slidesage-backend",
    },
});

export const db = drizzle(client, { schema });

export type Database = typeof db;
export * from "./schema";
