/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StreamingProvider } from "@/modules/contexts/StreamingContext";
import GenerateResearchPage from "@/modules/pages/GenerateResearchPage";

describe("GenerateResearchPage", () => {
    it("keeps generation disabled while the Strict Mode replacement request is loading", async () => {
        const originalFetch = globalThis.fetch;
        let requestCount = 0;
        let resolveResearch: ((response: Response) => void) | undefined;

        globalThis.fetch = mock((_input: RequestInfo | URL, init?: RequestInit) => {
            requestCount += 1;

            if (requestCount === 1) {
                return new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener("abort", () => {
                        reject(new DOMException("Aborted", "AbortError"));
                    });
                });
            }

            return new Promise<Response>((resolve) => {
                resolveResearch = resolve;
            });
        }) as unknown as typeof fetch;

        try {
            const view = render(
                <StrictMode>
                    <MemoryRouter
                        initialEntries={[
                            {
                                pathname: "/generate/research",
                                state: {
                                    prompt: "Battery storage market",
                                    slideCount: 5,
                                    detailLevel: "balanced",
                                    tonality: "professional",
                                },
                            },
                        ]}
                    >
                        <StreamingProvider>
                            <Routes>
                                <Route
                                    path="/generate/research"
                                    element={<GenerateResearchPage />}
                                />
                            </Routes>
                        </StreamingProvider>
                    </MemoryRouter>
                </StrictMode>,
            );

            await waitFor(() => expect(requestCount).toBe(2));
            expect(view.getByText("Proceed to Generate").closest("button")).toBeDisabled();
            expect(
                view.getByText("Searching, reading, and synthesizing relevant sources..."),
            ).toBeInTheDocument();

            resolveResearch?.(
                new Response(
                    JSON.stringify({
                        summary: "Storage demand is increasing.",
                        sources: [
                            {
                                url: "https://example.com/storage",
                                title: "Battery storage outlook",
                                snippet: "A complete source preview.",
                            },
                        ],
                        tokens_used: 12,
                        tokens_estimated: 14,
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            );

            await waitFor(() => {
                expect(view.getByText("Storage demand is increasing.")).toBeInTheDocument();
            });
            expect(view.getByText("Battery storage outlook")).toBeInTheDocument();
            expect(view.getByText("A complete source preview.")).toBeInTheDocument();
            expect(view.getByText("Proceed to Generate").closest("button")).not.toBeDisabled();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
