/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { GenerateOptionsBar } from "@/components/Generate";

describe("GenerateOptionsBar", () => {
    it("changes the generation theme", () => {
        const onThemeChange = mock();
        const view = render(
            <GenerateOptionsBar
                detailLevel="balanced"
                tonality="professional"
                useWebResearch={false}
                slideCountMode="preset"
                slideCount="5"
                customSlideCount="5"
                theme="corporate-blue"
                onDetailLevelChange={mock()}
                onTonalityChange={mock()}
                onUseWebResearchChange={mock()}
                onSlideCountModeChange={mock()}
                onSlideCountChange={mock()}
                onCustomSlideCountChange={mock()}
                onThemeChange={onThemeChange}
            />,
        );

        fireEvent.pointerDown(view.getByRole("button", { name: /Theme: Corporate Blue/ }), {
            button: 0,
            ctrlKey: false,
        });
        fireEvent.click(view.getByRole("menuitem", { name: "Nature Green" }));
        expect(onThemeChange).toHaveBeenCalledWith("nature-green");
    });
});
