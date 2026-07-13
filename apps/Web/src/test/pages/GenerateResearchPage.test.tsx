/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
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
            expect(view.getByText("Sources")).toBeInTheDocument();

            resolveResearch?.(
                new Response(
                    JSON.stringify({
                        sources: [
                            {
                                url: "https://example.com/storage",
                                title: "Battery storage outlook",
                                snippet: "A complete source preview.",
                            },
                        ],
                        estimated_tokens: 5.8,
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            );

            await waitFor(() => {
                expect(view.getByText("Battery storage outlook")).toBeInTheDocument();
            });
            expect(view.getByRole("table", { name: "Research sources" })).toBeInTheDocument();
            expect(view.getByText("A complete source preview.")).toBeInTheDocument();
            expect(view.getByText("Estimated 5.8 points")).toBeInTheDocument();
            const sourceLink = view.getByRole("link", {
                name: "Open source: Battery storage outlook",
            });
            expect(sourceLink).toHaveAttribute("href", "https://example.com/storage");
            expect(sourceLink).toHaveAttribute("target", "_blank");
            expect(view.getByText("Proceed to Generate").closest("button")).not.toBeDisabled();
            expect(view.getByText("Enter").parentElement).toHaveTextContent(
                "Press Enter to generate",
            );

            fireEvent.keyDown(sourceLink, { key: "Enter" });
            expect(requestCount).toBe(2);

            fireEvent.keyDown(window, { key: "Enter" });

            await waitFor(() => expect(requestCount).toBe(3));
            expect(view.getByText("Processing...")).toBeInTheDocument();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
