/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StreamingProvider } from "@/modules/contexts/StreamingContext";
import GeneratePPTPage from "@/modules/pages/GeneratePPTPage";

it("prefills a failed presentation prompt and generation options", () => {
    const view = render(
        <MemoryRouter
            initialEntries={[
                {
                    pathname: "/generate",
                    state: {
                        retry: {
                            prompt: "Retry this market analysis",
                            slide_count: 12,
                            detail_level: "comprehensive",
                            tonality: "casual",
                            research_enabled: true,
                            theme: "nature-green",
                        },
                    },
                },
            ]}
        >
            <StreamingProvider>
                <Routes>
                    <Route path="/generate" element={<GeneratePPTPage />} />
                </Routes>
            </StreamingProvider>
        </MemoryRouter>,
    );

    expect(view.getByRole("textbox", { name: "Topic 1" })).toHaveValue(
        "Retry this market analysis",
    );
    expect(view.getByDisplayValue("12")).toBeInTheDocument();
    expect(view.getByText("Comprehensive")).toBeInTheDocument();
    expect(view.getByText("Casual")).toBeInTheDocument();
    expect(view.getByText("Nature Green")).toBeInTheDocument();
    expect(view.getByRole("button", { name: /Web Research/ })).toHaveClass("bg-white/10");
    expect(view.getByRole("button", { name: "Start Generating" })).not.toBeDisabled();
});

it("opens the viewer immediately while generation waits for the stream", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(() => new Promise<Response>(() => {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
        const view = render(
            <MemoryRouter
                initialEntries={[
                    {
                        pathname: "/generate",
                        state: {
                            retry: {
                                prompt: "Immediate viewer navigation",
                                slide_count: 5,
                                detail_level: "balanced",
                                tonality: "professional",
                                research_enabled: false,
                            },
                        },
                    },
                ]}
            >
                <StreamingProvider>
                    <Routes>
                        <Route path="/generate" element={<GeneratePPTPage />} />
                        <Route
                            path="/presentation"
                            element={<div>Viewer waiting for stream</div>}
                        />
                    </Routes>
                </StreamingProvider>
            </MemoryRouter>,
        );

        fireEvent.click(view.getByRole("button", { name: "Start Generating" }));

        await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1));
        expect(view.getByText("Viewer waiting for stream")).toBeInTheDocument();
    } finally {
        globalThis.fetch = originalFetch;
    }
});
