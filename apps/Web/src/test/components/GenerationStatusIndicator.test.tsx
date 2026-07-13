/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { GenerationStatusIndicatorView } from "@/components/GenerationStatusIndicator";

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
    expect(button.querySelector('[style*="scaleX(0.4)"]')).toBeInTheDocument();

    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledTimes(1);
});

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

    expect(
        view.getByRole("button", {
            name: "Generation stopped. The stream was interrupted",
        }),
    ).toBeInTheDocument();

    await waitFor(() => {
        expect(
            view.queryByRole("button", {
                name: "Generation stopped. The stream was interrupted",
            }),
        ).toBeNull();
    });
});
