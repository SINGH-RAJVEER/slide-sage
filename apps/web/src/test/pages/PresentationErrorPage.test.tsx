/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

mock.module("@/modules/Header", () => ({
    default: () => <header data-testid="app-header" />,
}));

function RouteStateProbe() {
    const location = useLocation();
    return <pre>{JSON.stringify(location.state)}</pre>;
}

describe("PresentationErrorPage", () => {
    it("shows the routed error without a presentations shortcut", async () => {
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
                </Routes>
            </MemoryRouter>,
        );

        expect(view.getByRole("heading", { level: 1 })).toHaveTextContent(
            "We couldn't finish this presentation",
        );
        expect(view.getByText("Generation unavailable")).toBeInTheDocument();
        expect(view.getByText("The generation stream was interrupted.")).toBeInTheDocument();
        expect(view.queryByText("Delete unfinished presentation")).toBeNull();
        expect(view.queryByText("Retry presentation")).toBeNull();
        expect(view.queryByRole("button", { name: "My Presentations" })).toBeNull();
    });

    it("reopens a saved failure for retry from the error page", async () => {
        const { default: PresentationErrorPage } = await import(
            "@/modules/pages/PresentationErrorPage"
        );
        const originalFetch = globalThis.fetch;
        const retryRequest = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
            expect(String(input)).toContain("/presentations/presentation_42");
            expect(init).toMatchObject({ credentials: "include" });

            return Response.json({
                presentation: {
                    id: "presentation_42",
                    title: "Failed deck",
                    prompt: "Retry this deck",
                    slides_data: {
                        title: "Failed deck",
                        theme: "corporate-blue",
                        slides: [],
                        status: "failed",
                        failure: {
                            message: "Generation failed",
                            retry: {
                                prompt: "Retry this deck",
                                slide_count: 7,
                                detail_level: "detailed",
                                tonality: "professional",
                                research_enabled: false,
                            },
                        },
                    },
                    created_at: "2026-07-14T10:00:00.000Z",
                    updated_at: "2026-07-14T10:00:00.000Z",
                },
            });
        });
        globalThis.fetch = retryRequest as unknown as typeof fetch;

        try {
            const view = render(
                <MemoryRouter initialEntries={["/presentation-error"]}>
                    <Routes>
                        <Route
                            path="/presentation-error"
                            element={<PresentationErrorPage presentationId="presentation_42" />}
                        />
                        <Route path="/generate" element={<RouteStateProbe />} />
                    </Routes>
                </MemoryRouter>,
            );

            fireEvent.click(view.getByRole("button", { name: "Retry presentation" }));

            await waitFor(() => {
                expect(retryRequest).toHaveBeenCalledTimes(1);
                expect(view.getByText(/"prompt":"Retry this deck"/)).toBeInTheDocument();
            });
            expect(view.getByText(/"slide_count":7/)).toBeInTheDocument();
            expect(view.getByText(/"retryPresentationId":"presentation_42"/)).toBeInTheDocument();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it("handles an HTML deployment error without exposing a JSON parser failure", async () => {
        const { default: PresentationErrorPage } = await import(
            "@/modules/pages/PresentationErrorPage"
        );
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(() =>
            Promise.resolve(
                new Response("<!DOCTYPE html><title>Deployment error</title>", {
                    status: 502,
                    headers: { "Content-Type": "text/html" },
                }),
            ),
        ) as unknown as typeof fetch;

        try {
            const view = render(
                <MemoryRouter initialEntries={["/presentation-error"]}>
                    <PresentationErrorPage presentationId="presentation_42" />
                </MemoryRouter>,
            );

            fireEvent.click(view.getByRole("button", { name: "Retry presentation" }));

            expect(
                await view.findByText(
                    "The presentation service returned an invalid response. Try again.",
                ),
            ).toBeInTheDocument();
            expect(view.queryByText(/Unexpected token/)).toBeNull();
        } finally {
            globalThis.fetch = originalFetch;
        }
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

        expect(view.getByText("Saved for retry")).toBeInTheDocument();

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
