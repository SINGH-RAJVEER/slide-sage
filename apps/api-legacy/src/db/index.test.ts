import { afterAll, describe, expect, it } from "bun:test";
import type { Database } from ".";
import { closeClientAfterResponse, closeProcessDatabases, db, runWithDatabase } from ".";

afterAll(closeProcessDatabases);

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

    it("closes a Worker client only after a JSON response body is consumed", async () => {
        let closes = 0;
        const response = await closeClientAfterResponse(Response.json({ ok: true }), async () => {
            closes++;
        });

        expect(closes).toBe(0);
        expect(await response.json()).toEqual({ ok: true });
        expect(closes).toBe(1);
    });

    it("closes a Worker client when a streaming response is cancelled", async () => {
        let closes = 0;
        const response = await closeClientAfterResponse(
            new Response(
                new ReadableStream<Uint8Array>({
                    pull(controller) {
                        controller.enqueue(new Uint8Array([1]));
                    },
                })
            ),
            async () => {
                closes++;
            }
        );
        const reader = response.body?.getReader();
        await reader?.read();
        await reader?.cancel();

        expect(closes).toBe(1);
    });

    it("waits for tracked stream cleanup before closing a cancelled Worker client", async () => {
        let closes = 0;
        let finishCleanup: () => void = () => undefined;
        const completion = new Promise<void>((resolve) => {
            finishCleanup = resolve;
        });
        const response = await closeClientAfterResponse(
            new Response(
                new ReadableStream<Uint8Array>({
                    pull(controller) {
                        controller.enqueue(new Uint8Array([1]));
                    },
                })
            ),
            async () => {
                closes++;
            },
            completion
        );
        const reader = response.body?.getReader();
        await reader?.read();
        const cancellation = reader?.cancel();
        await Bun.sleep(1);

        expect(closes).toBe(0);
        finishCleanup();
        await cancellation;
        expect(closes).toBe(1);
    });
});
