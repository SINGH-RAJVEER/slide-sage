/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import type React from "react";
import { ViewerHeaderControls } from "@/components/Viewer/ViewerHeaderControls";

const renderHeader = (
    overrides: Partial<React.ComponentProps<typeof ViewerHeaderControls>> = {},
) => {
    const onPresent = mock();
    const props: React.ComponentProps<typeof ViewerHeaderControls> = {
        title: "Quarterly review",
        canIterate: true,
        currentTemplate: "corporate-blue",
        onBack: mock(),
        onTemplateChange: mock(),
        selectedLayout: "body",
        onLayoutChange: mock(),
        layoutDisabled: false,
        onIterate: mock(),
        onPresent,
        presentDisabled: false,
        ...overrides,
    };

    return { view: render(<ViewerHeaderControls {...props} />), onPresent };
};

it("uses Present as the fullscreen action", () => {
    const { view, onPresent } = renderHeader();

    fireEvent.click(view.getByRole("button", { name: "Present" }));

    expect(onPresent).toHaveBeenCalledTimes(1);
});

it("disables Present until slides are available", () => {
    const { view, onPresent } = renderHeader({ presentDisabled: true });
    const present = view.getByRole("button", { name: "Present" });

    expect(present).toBeDisabled();
    fireEvent.click(present);

    expect(onPresent).not.toHaveBeenCalled();
});

it("shows a fixed theme indicator and omits generation controls in preview mode", () => {
    const { view } = renderHeader({
        themeLabel: "Midnight Signal",
        showIterate: false,
        showLayoutSelector: false,
    });

    expect(view.getByText("Midnight Signal")).toBeInTheDocument();
    expect(view.queryByRole("button", { name: "Iterate" })).toBeNull();
    expect(view.queryByRole("combobox")).toBeNull();
});
