/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PRESENTATIONS_UPDATED_EVENT } from "@/lib/presentation-events";
import PresentationsGridPage from "@/modules/pages/PresentationsGridPage";

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
