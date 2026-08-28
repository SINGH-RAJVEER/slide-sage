/// <reference lib="dom" />

import { expect, it } from "bun:test";
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
});
