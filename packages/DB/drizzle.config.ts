import { defineConfig } from "drizzle-kit";

const databaseUrl =
    process.env.DATABASE_URL || "postgresql://slidesage:slidesage@localhost:5432/slidesage";

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: databaseUrl,
    },
});
