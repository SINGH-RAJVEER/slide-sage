import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "jsdom",
        setupFiles: "./src/test/bun-setup.ts",
        include: ["src/**/*.{test,spec}.{ts,tsx}"],
        pool: "forks",
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            exclude: ["node_modules/", "src/test/", "**/*.config.ts", "**/*.d.ts"],
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
