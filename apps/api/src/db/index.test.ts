import { describe, expect, it } from "bun:test";
import type { Database } from ".";
import { db, runWithDatabase } from ".";

describe("request-scoped database", () => {
    it("keeps overlapping async contexts isolated", async () => {
        const firstDatabase = { marker: "first" } as unknown as Database;
        const secondDatabase = { marker: "second" } as unknown as Database;

        const [first, second] = await Promise.all([
            runWithDatabase(firstDatabase, async () => {
                await Bun.sleep(5);
                return (db as unknown as { marker: string }).marker;
            }),
            runWithDatabase(secondDatabase, async () => {
                await Bun.sleep(1);
                return (db as unknown as { marker: string }).marker;
            }),
        ]);

        expect(first).toBe("first");
        expect(second).toBe("second");
    });

    it("preserves the request database while a response stream is consumed", async () => {
        const streamDatabase = { marker: "stream" } as unknown as Database;
        const response = runWithDatabase(
            streamDatabase,
            () =>
                new Response(
                    new ReadableStream({
                        async start(controller) {
                            await Bun.sleep(1);
                            const marker = (db as unknown as { marker: string }).marker;
                            controller.enqueue(marker);
                            controller.close();
                        },
                    })
                )
        );

        expect(await response.text()).toBe("stream");
    });
});
