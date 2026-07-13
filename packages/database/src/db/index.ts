import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const DEFAULT_CONNECTION_STRING = "postgresql://slidesage:slidesage@localhost:5432/slidesage";

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
    const timeout = Number.parseInt(process.env["DATABASE_CONNECT_TIMEOUT"] ?? "10", 10);
    return Number.isFinite(timeout) && timeout > 0 ? timeout : 10;
}

export function createDatabase(connectionString: string) {
    const client = postgres(connectionString, {
        ssl: resolveSSL(connectionString),
        connect_timeout: resolveConnectTimeout(),
        max: 5,
        connection: {
            application_name: "slidesage-backend",
        },
    });

    return {
        client,
        db: drizzle(client, { schema }),
    };
}

type DatabaseInstance = ReturnType<typeof createDatabase>;
export type Database = DatabaseInstance["db"];

const defaultDatabase = createDatabase(process.env["DATABASE_URL"] || DEFAULT_CONNECTION_STRING);
const requestDatabase = new AsyncLocalStorage<Database>();

export const client = defaultDatabase.client;

export const db = new Proxy(defaultDatabase.db, {
    get(_target, property) {
        const activeDatabase = requestDatabase.getStore() ?? defaultDatabase.db;
        const value = Reflect.get(activeDatabase, property, activeDatabase);
        return typeof value === "function" ? value.bind(activeDatabase) : value;
    },
}) as Database;

export function runWithDatabase<T>(database: Database, callback: () => T): T {
    return requestDatabase.run(database, callback);
}

export * from "./schema";
