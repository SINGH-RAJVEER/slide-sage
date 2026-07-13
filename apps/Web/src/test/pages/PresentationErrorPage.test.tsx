/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

mock.module("@/components/Header", () => ({
    default: () => <header data-testid="app-header" />,
}));

describe("PresentationErrorPage", () => {
    it("shows the routed error and returns to presentations", async () => {
        const { default: PresentationErrorPage } = await import(
            "@/modules/pages/PresentationErrorPage"
        );
        const view = render(
            <MemoryRouter
                initialEntries={[
                    {
                        pathname: "/presentation-error",
                        state: { error: "The generation stream was interrupted." },
                    },
                ]}
            >
                <Routes>
                    <Route path="/presentation-error" element={<PresentationErrorPage />} />
                    <Route path="/presentations" element={<div>Presentation library</div>} />
                </Routes>
            </MemoryRouter>,
        );

        expect(view.getByRole("heading", { level: 1 })).toHaveTextContent(
            "We couldn't finish this presentation",
        );
        expect(view.getByText("The generation stream was interrupted.")).toBeInTheDocument();
        expect(view.queryByText("Delete unfinished presentation")).toBeNull();

        fireEvent.click(view.getByRole("button", { name: "My Presentations" }));

        expect(view.getByText("Presentation library")).toBeInTheDocument();
    });

    it("uses the provided delete action for an unfinished presentation", async () => {
        const { default: PresentationErrorPage } = await import(
            "@/modules/pages/PresentationErrorPage"
        );
        const onDelete = mock(() => {});
        const view = render(
            <MemoryRouter initialEntries={["/presentation-error"]}>
                <PresentationErrorPage presentationId={42} onDelete={onDelete} />
            </MemoryRouter>,
        );

        fireEvent.click(view.getByRole("button", { name: "Delete unfinished presentation" }));

        expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it("deletes a saved unfinished presentation with the current session", async () => {
        const { default: PresentationErrorPage } = await import(
            "@/modules/pages/PresentationErrorPage"
        );
        const originalFetch = globalThis.fetch;
        const deleteRequest = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
            expect(init).toMatchObject({
                method: "DELETE",
                credentials: "include",
            });
            return new Response(null, { status: 204 });
        });
        globalThis.fetch = deleteRequest as unknown as typeof fetch;

        try {
            const view = render(
                <MemoryRouter initialEntries={["/presentation-error"]}>
                    <Routes>
                        <Route
                            path="/presentation-error"
                            element={<PresentationErrorPage presentationId="presentation_42" />}
                        />
                        <Route path="/presentations" element={<div>Presentation library</div>} />
                    </Routes>
                </MemoryRouter>,
            );

            fireEvent.click(view.getByRole("button", { name: "Delete unfinished presentation" }));

            await waitFor(() => expect(deleteRequest).toHaveBeenCalledTimes(1));
            expect(view.getByText("Presentation library")).toBeInTheDocument();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
