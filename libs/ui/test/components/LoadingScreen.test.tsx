/// <reference lib="dom" />

import { describe, expect, it } from "bun:test";
import { LoadingScreen } from "@slidesage/ui/components/loading-screen";
import { render } from "@testing-library/react";

describe("LoadingScreen", () => {
	it("exposes the loading state with the provided accessible label", () => {
		const { getByLabelText } = render(<LoadingScreen label="Loading presentation" />);

		const orb = getByLabelText("Loading presentation");
		expect(orb).toHaveAttribute("role", "img");
		expect(orb.tagName).toBe("CANVAS");
		expect(orb).toHaveAttribute("aria-label", "Loading presentation");
	});
});
