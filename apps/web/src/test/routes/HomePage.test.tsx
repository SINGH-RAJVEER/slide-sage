/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import HomePage from "@/routes/HomePage";

it("checks only one presentation and routes from the response list", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async () =>
        Response.json({
            presentations: [
                {
                    id: "presentation_1",
                    title: "Existing deck",
                    prompt: "Existing prompt",
                    slide_count: 5,
                    status: "ready",
                    has_research: false,
                    created_at: "2026-07-14T10:00:00.000Z",
                    updated_at: "2026-07-14T10:00:00.000Z",
                },
            ],
            total: 1,
            limit: 1,
            offset: 0,
            has_more: false,
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
        const view = render(
            <MemoryRouter initialEntries={["/"]}>
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/presentations" element={<div>Presentation library</div>} />
                </Routes>
            </MemoryRouter>,
        );

        expect(await view.findByText("Presentation library")).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("?limit=1"), {
            credentials: "include",
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});
