/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StreamingProvider, useStreaming } from "@/modules/contexts/StreamingContext";
import GenerationStatusIndicator from "@/modules/GenerationStatusIndicator";

function StartGeneration() {
    const { startStreaming } = useStreaming();

    return (
        <button
            type="button"
            onClick={() => void startStreaming("Grid storage", 5, "balanced", "professional")}
        >
            Start generation
        </button>
    );
}

it("shows an active generation indicator on the generate page", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => new Promise<Response>(() => {})) as unknown as typeof fetch;

    try {
        const view = render(
            <MemoryRouter initialEntries={["/generate"]}>
                <StreamingProvider>
                    <Routes>
                        <Route
                            path="/generate"
                            element={
                                <>
                                    <StartGeneration />
                                    <GenerationStatusIndicator />
                                </>
                            }
                        />
                    </Routes>
                </StreamingProvider>
            </MemoryRouter>,
        );

        fireEvent.click(view.getByRole("button", { name: "Start generation" }));

        await waitFor(() => {
            expect(
                view.getByRole("button", {
                    name: "Generating presentation. Preparing your presentation",
                }),
            ).toHaveClass("top-24", "right-4");
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

it("does not duplicate generation status on the active viewer", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(() => new Promise<Response>(() => {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
        const view = render(
            <MemoryRouter initialEntries={["/presentation"]}>
                <StreamingProvider>
                    <StartGeneration />
                    <GenerationStatusIndicator />
                </StreamingProvider>
            </MemoryRouter>,
        );

        fireEvent.click(view.getByRole("button", { name: "Start generation" }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        expect(
            view.queryByRole("button", {
                name: "Generating presentation. Preparing your presentation",
            }),
        ).toBeNull();
    } finally {
        globalThis.fetch = originalFetch;
    }
});

for (const loginPath of ["/sign-in", "/login"]) {
    it(`does not show generation status on ${loginPath}`, async () => {
        const originalFetch = globalThis.fetch;
        const fetchMock = mock(() => new Promise<Response>(() => {}));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        try {
            const view = render(
                <MemoryRouter initialEntries={[loginPath]}>
                    <StreamingProvider>
                        <Routes>
                            <Route
                                path={loginPath}
                                element={
                                    <>
                                        <StartGeneration />
                                        <GenerationStatusIndicator />
                                    </>
                                }
                            />
                        </Routes>
                    </StreamingProvider>
                </MemoryRouter>,
            );

            fireEvent.click(view.getByRole("button", { name: "Start generation" }));

            await waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });
            expect(
                view.queryByRole("button", {
                    name: "Generating presentation. Preparing your presentation",
                }),
            ).toBeNull();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
}
