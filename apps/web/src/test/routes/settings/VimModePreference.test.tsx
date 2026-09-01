/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { VimModeProvider } from "@/context/VimModeContext";
import { VimModePreference } from "@/routes/settings/VimModePreference";

it("persists the Vim mode setting", () => {
	window.localStorage.removeItem("slidesage-vim-mode");
	const view = render(
		<VimModeProvider>
			<VimModePreference />
		</VimModeProvider>,
	);

	const toggle = view.getByRole("switch", { name: "Enable Vim mode" });
	expect(toggle).toHaveAttribute("data-state", "unchecked");

	fireEvent.click(toggle);

	expect(toggle).toHaveAttribute("data-state", "checked");
	expect(window.localStorage.getItem("slidesage-vim-mode")).toBe("true");
	expect(document.documentElement).toHaveAttribute("data-vim-mode");
});

it("does not show the Vim mode setting on mobile viewports", () => {
	const originalMatchMedia = window.matchMedia;
	window.matchMedia = mock((query: string) => ({
		matches: query === "(max-width: 767px)",
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	}));

	try {
		const view = render(
			<VimModeProvider>
				<VimModePreference />
			</VimModeProvider>,
		);
		expect(view.queryByRole("switch", { name: "Enable Vim mode" })).toBeNull();
	} finally {
		window.matchMedia = originalMatchMedia;
	}
});
