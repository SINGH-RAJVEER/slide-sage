/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import GenerationStatusIndicator, {
    GenerationStatusIndicatorView,
} from "@/components/GenerationStatusIndicator";
import { StreamingProvider, useStreaming } from "@/modules/contexts/StreamingContext";

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

it("shows live slide progress and opens the active generation", () => {
    const onActivate = mock(() => {});
    const view = render(
        <GenerationStatusIndicatorView
            status="active"
            title="Generating presentation"
            detail="2 of 5 slides ready"
            progress={0.4}
            onActivate={onActivate}
        />,
    );

    const button = view.getByRole("button", {
        name: "Generating presentation. 2 of 5 slides ready",
    });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("top-24", "right-4", "sm:right-5");
    expect(button).toHaveClass("h-10", "w-10", "hover:w-80", "focus-visible:w-80");
    expect(button).not.toHaveClass("bottom-4", "left-4");
    expect(button.querySelector('[style*="scaleX(0.4)"]')).toBeInTheDocument();

    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledTimes(1);
});

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
                    name: "Generating presentation. Grid storage",
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
                name: "Generating presentation. Grid storage",
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
                    name: "Generating presentation. Grid storage",
                }),
            ).toBeNull();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
}

it("reports when the presentation has been saved", () => {
    const onActivate = mock(() => {});
    const view = render(
        <GenerationStatusIndicatorView
            status="complete"
            title="Presentation ready"
            detail="Saved to Presentations"
            onActivate={onActivate}
        />,
    );

    fireEvent.click(
        view.getByRole("button", {
            name: "Presentation ready. Saved to Presentations",
        }),
    );
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(
        view.getByRole("button", {
            name: "Presentation ready. Saved to Presentations",
        }),
    ).toHaveClass("top-24", "right-4");
});

it("hides a stopped-generation message after its cooldown", async () => {
    const view = render(
        <GenerationStatusIndicatorView
            status="error"
            title="Generation stopped"
            detail="The stream was interrupted"
            autoDismissMs={20}
            onActivate={() => {}}
        />,
    );

    const errorPopIn = view.getByRole("button", {
        name: "Generation stopped. The stream was interrupted",
    });
    expect(errorPopIn).toBeInTheDocument();
    expect(errorPopIn).toHaveClass("top-24", "right-4");
    expect(errorPopIn).not.toHaveClass("bottom-4", "left-4");
    expect(errorPopIn).toHaveAttribute("aria-live", "assertive");

    await waitFor(() => {
        expect(
            view.queryByRole("button", {
                name: "Generation stopped. The stream was interrupted",
            }),
        ).toBeNull();
    });
});
