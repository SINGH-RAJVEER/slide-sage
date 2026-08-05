/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { GenerationThemeSelector } from "@slidesage/ui/components/Generate/GenerationThemeSelector";
import { fireEvent, render } from "@testing-library/react";

describe("GenerationThemeSelector", () => {
	it("shows installed marketplace themes and selects their base theme", () => {
		const onThemeChange = mock(() => {});
		const { getByRole } = render(
			<GenerationThemeSelector
				theme="corporate-blue"
				onThemeChange={onThemeChange}
				installedThemes={[
					{
						marketplaceId: "midnight-signal",
						themeId: "modern-dark",
						name: "Midnight Signal",
					},
				]}
			/>,
		);

		fireEvent.pointerDown(getByRole("button", { name: /Theme: Corporate Blue/i }), {
			button: 0,
			ctrlKey: false,
		});
		fireEvent.click(getByRole("menuitem", { name: /Midnight Signal Marketplace/i }));

		expect(onThemeChange).toHaveBeenCalledWith("modern-dark");
	});
});
