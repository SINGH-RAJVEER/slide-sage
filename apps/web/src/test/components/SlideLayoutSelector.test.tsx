/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { SlideLayoutSelector } from "@slide-sage/ui/components/Viewer/SlideLayoutSelector";
import { fireEvent, render } from "@testing-library/react";

describe("SlideLayoutSelector", () => {
    it("selects a layout independently from the theme control", () => {
        const onLayoutChange = mock();
        const view = render(
            <SlideLayoutSelector selectedLayout="body" onLayoutChange={onLayoutChange} />,
        );

        fireEvent.pointerDown(view.getByRole("button", { name: /Body/ }), {
            button: 0,
            ctrlKey: false,
        });
        fireEvent.click(view.getByRole("menuitem", { name: "Media right" }));

        expect(onLayoutChange).toHaveBeenCalledWith("media-right");
    });

    it("disables layout changes for chart slides", () => {
        const view = render(
            <SlideLayoutSelector
                selectedLayout={undefined}
                onLayoutChange={mock()}
                disabled={true}
            />,
        );

        expect(view.getByRole("button", { name: /Chart layout/ })).toBeDisabled();
    });
});
