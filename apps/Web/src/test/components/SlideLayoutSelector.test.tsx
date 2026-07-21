/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { SlideLayoutSelector } from "@/components/Viewer/SlideLayoutSelector";

describe("SlideLayoutSelector", () => {
    it("selects a layout independently from the theme control", () => {
        const onLayoutChange = mock();
        const view = render(
            <SlideLayoutSelector selectedLayout="content" onLayoutChange={onLayoutChange} />,
        );

        fireEvent.pointerDown(view.getByRole("button", { name: /Content/ }), {
            button: 0,
            ctrlKey: false,
        });
        fireEvent.click(view.getByRole("menuitem", { name: "Image right" }));

        expect(onLayoutChange).toHaveBeenCalledWith("image-right");
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
