/// <reference lib="dom" />

import { describe, expect, it } from "bun:test";
import { LoadingScreen } from "@slide-sage/ui/components/loading-screen";
import { render } from "@testing-library/react";

describe("LoadingScreen", () => {
    it("centers an accessible loading indicator in the viewport", () => {
        const { getByLabelText } = render(<LoadingScreen label="Loading presentation" />);

        const spinner = getByLabelText("Loading presentation");
        const screen = spinner.parentElement;

        expect(screen).toHaveClass("fixed", "inset-0", "grid", "place-items-center");
        expect(spinner).toHaveClass("h-9", "w-9", "text-white");
        expect(spinner).toHaveAttribute("role", "status");
        expect(spinner).toHaveAttribute("aria-label", "Loading presentation");
        expect(spinner.tagName).toBe("svg");
    });
});
