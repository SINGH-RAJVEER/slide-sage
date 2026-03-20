import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
    process.env.DATABASE_URL || "postgresql://slidesage:slidesage@localhost:5432/slidesage";

export const client = postgres(connectionString, {
    ssl: connectionString.includes("ssl=require") ? "require" : false,
    connection: {
        application_name: "slidesage-backend",
    },
});

export const db = drizzle(client, { schema });

export type Database = typeof db;
export * from "./schema";
