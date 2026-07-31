/// <reference lib="dom" />

import { afterEach, expect, it, jest, mock } from "bun:test";
import { GenerationStatusIndicatorView } from "@slide-sage/ui/components/GenerationStatusIndicator";
import { act, fireEvent, render } from "@testing-library/react";

afterEach(() => {
    jest.useRealTimers();
});

it("clamps progress and activates the status destination", () => {
    const onActivate = mock(() => {});
    const view = render(
        <GenerationStatusIndicatorView
            status="active"
            title="Generating presentation"
            detail="2 of 5 slides ready"
            progress={2}
            onActivate={onActivate}
        />,
    );
    const button = view.getByRole("button", {
        name: "Generating presentation. 2 of 5 slides ready",
    });

    expect(button.querySelector('[style*="scaleX(1)"]')).toBeInTheDocument();
    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledTimes(1);
});

it("announces errors assertively and dismisses them after the cooldown", () => {
    jest.useFakeTimers();
    const view = render(
        <GenerationStatusIndicatorView
            status="error"
            title="Generation stopped"
            detail="The stream was interrupted"
            autoDismissMs={20}
            onActivate={() => {}}
        />,
    );
    const status = view.getByRole("button", {
        name: "Generation stopped. The stream was interrupted",
    });

    expect(status).toHaveAttribute("aria-live", "assertive");
    act(() => jest.advanceTimersByTime(20));
    expect(
        view.queryByRole("button", { name: status.getAttribute("aria-label") || "" }),
    ).toBeNull();
});
