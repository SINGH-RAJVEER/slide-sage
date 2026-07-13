/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { PRESENTATIONS_UPDATED_EVENT } from "@/lib/presentation-events";
import PresentationsGridPage from "@/modules/pages/PresentationsGridPage";

function RouteStateProbe() {
    const location = useLocation();
    return <pre>{JSON.stringify(location.state)}</pre>;
}

it("refreshes an open presentations page after a generated deck is saved", async () => {
    const originalFetch = globalThis.fetch;
    let requestCount = 0;

    globalThis.fetch = mock(async () => {
        requestCount += 1;
        const presentations =
            requestCount === 1
                ? []
                : [
                      {
                          id: "presentation_1",
                          title: "Finished background deck",
                          prompt: "Background generation",
                          slide_count: 5,
                          created_at: "2026-07-13T10:00:00.000Z",
                          updated_at: "2026-07-13T10:05:00.000Z",
                      },
                  ];

        return new Response(JSON.stringify({ presentations }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }) as unknown as typeof fetch;

    try {
        const view = render(
            <MemoryRouter>
                <PresentationsGridPage />
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(view.getByText("No Presentations Generated Yet")).toBeInTheDocument();
        });

        await act(async () => {
            window.dispatchEvent(new CustomEvent(PRESENTATIONS_UPDATED_EVENT));
        });

        await waitFor(() => {
            expect(view.getByText("Finished background deck")).toBeInTheDocument();
        });
        expect(requestCount).toBe(2);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

describe("failed presentation retries", () => {
    it("opens saved web research on the sources page", async () => {
        const originalFetch = globalThis.fetch;
        let requestCount = 0;

        globalThis.fetch = mock(async () => {
            requestCount += 1;
            if (requestCount === 1) {
                return Response.json({
                    presentations: [
                        {
                            id: "failed_research",
                            title: "Research retry",
                            prompt: "Research retry",
                            slide_count: 0,
                            status: "failed",
                            has_research: true,
                            created_at: "2026-07-14T10:00:00.000Z",
                            updated_at: "2026-07-14T10:00:00.000Z",
                        },
                    ],
                });
            }

            return Response.json({
                presentation: {
                    id: "failed_research",
                    title: "Research retry",
                    prompt: "Research retry",
                    slides_data: {
                        title: "Research retry",
                        theme: "corporate-blue",
                        slides: [],
                        status: "failed",
                        failure: {
                            message: "Failed",
                            retry: {
                                prompt: "Research retry",
                                slide_count: 8,
                                detail_level: "detailed",
                                tonality: "persuasive",
                                research_enabled: true,
                                research_payload: {
                                    sources: [
                                        {
                                            url: "https://example.com/source",
                                            title: "Saved source",
                                        },
                                    ],
                                    estimated_tokens: 9.2,
                                },
                            },
                        },
                    },
                    created_at: "2026-07-14T10:00:00.000Z",
                    updated_at: "2026-07-14T10:00:00.000Z",
                },
            });
        }) as unknown as typeof fetch;

        try {
            const view = render(
                <MemoryRouter initialEntries={["/presentations"]}>
                    <Routes>
                        <Route path="/presentations" element={<PresentationsGridPage />} />
                        <Route path="/generate/research" element={<RouteStateProbe />} />
                    </Routes>
                </MemoryRouter>,
            );

            await waitFor(() => expect(view.getAllByText("Research retry")).toHaveLength(2));
            expect(view.getByText("Ready to retry")).toBeInTheDocument();
            fireEvent.click(view.getAllByText("Research retry")[0] as HTMLElement);

            await waitFor(() => expect(view.getByText(/Saved source/)).toBeInTheDocument());
            expect(view.getByText(/"slideCount":8/)).toBeInTheDocument();
            expect(requestCount).toBe(2);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it("opens a non-research retry with its generation options", async () => {
        const originalFetch = globalThis.fetch;
        let requestCount = 0;

        globalThis.fetch = mock(async () => {
            requestCount += 1;
            if (requestCount === 1) {
                return Response.json({
                    presentations: [
                        {
                            id: "failed_plain",
                            title: "Plain retry",
                            prompt: "Plain retry",
                            slide_count: 0,
                            status: "failed",
                            has_research: false,
                            created_at: "2026-07-14T10:00:00.000Z",
                            updated_at: "2026-07-14T10:00:00.000Z",
                        },
                    ],
                });
            }

            return Response.json({
                presentation: {
                    id: "failed_plain",
                    title: "Plain retry",
                    prompt: "Plain retry",
                    slides_data: {
                        title: "Plain retry",
                        theme: "corporate-blue",
                        slides: [],
                        status: "failed",
                        failure: {
                            message: "Failed",
                            retry: {
                                prompt: "Plain retry",
                                slide_count: 12,
                                detail_level: "comprehensive",
                                tonality: "casual",
                                research_enabled: false,
                            },
                        },
                    },
                    created_at: "2026-07-14T10:00:00.000Z",
                    updated_at: "2026-07-14T10:00:00.000Z",
                },
            });
        }) as unknown as typeof fetch;

        try {
            const view = render(
                <MemoryRouter initialEntries={["/presentations"]}>
                    <Routes>
                        <Route path="/presentations" element={<PresentationsGridPage />} />
                        <Route path="/generate" element={<RouteStateProbe />} />
                    </Routes>
                </MemoryRouter>,
            );

            await waitFor(() => expect(view.getAllByText("Plain retry")).toHaveLength(2));
            fireEvent.click(view.getAllByText("Plain retry")[0] as HTMLElement);

            await waitFor(() => expect(view.getByText(/"slide_count":12/)).toBeInTheDocument());
            expect(view.getByText(/"detail_level":"comprehensive"/)).toBeInTheDocument();
            expect(requestCount).toBe(2);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
