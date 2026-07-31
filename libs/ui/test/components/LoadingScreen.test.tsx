/// <reference lib="dom" />

import { describe, expect, it } from "bun:test";
import { LoadingScreen } from "@slide-sage/ui/components/loading-screen";
import { render } from "@testing-library/react";

describe("LoadingScreen", () => {
    it("exposes the loading state with the provided accessible label", () => {
        const { getByLabelText } = render(<LoadingScreen label="Loading presentation" />);

        const spinner = getByLabelText("Loading presentation");
        expect(spinner).toHaveAttribute("role", "status");
        expect(spinner).toHaveAttribute("aria-label", "Loading presentation");
    });
});
