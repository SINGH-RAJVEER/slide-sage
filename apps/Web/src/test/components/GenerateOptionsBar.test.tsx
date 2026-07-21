/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { GenerateOptionsBar } from "@/components/Generate";

describe("GenerateOptionsBar", () => {
    it("changes theme and layout preference from separate dropdowns", () => {
        const onThemeChange = mock();
        const onLayoutPreferenceChange = mock();
        const view = render(
            <GenerateOptionsBar
                detailLevel="balanced"
                tonality="professional"
                useWebResearch={false}
                slideCountMode="preset"
                slideCount="5"
                customSlideCount="5"
                theme="corporate-blue"
                layoutPreference="auto"
                onDetailLevelChange={mock()}
                onTonalityChange={mock()}
                onUseWebResearchChange={mock()}
                onSlideCountModeChange={mock()}
                onSlideCountChange={mock()}
                onCustomSlideCountChange={mock()}
                onThemeChange={onThemeChange}
                onLayoutPreferenceChange={onLayoutPreferenceChange}
            />,
        );

        fireEvent.pointerDown(view.getByRole("button", { name: /Theme: Corporate Blue/ }), {
            button: 0,
            ctrlKey: false,
        });
        fireEvent.click(view.getByRole("menuitem", { name: "Nature Green" }));
        expect(onThemeChange).toHaveBeenCalledWith("nature-green");

        fireEvent.pointerDown(view.getByRole("button", { name: /Layout: Auto mix/ }), {
            button: 0,
            ctrlKey: false,
        });
        fireEvent.click(view.getByRole("menuitem", { name: /Image-led/ }));
        expect(onLayoutPreferenceChange).toHaveBeenCalledWith("image-led");
    });
});
