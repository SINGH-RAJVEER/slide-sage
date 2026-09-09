/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import TemplateSelector, {
	type InstalledTemplateOption,
} from "@slidesage/ui/components/Generate/TemplateSelector";
import { fireEvent, render } from "@testing-library/react";

const openSelector = (
	onTemplateChange = mock(),
	installedThemes: InstalledTemplateOption[] = [],
) => {
	const view = render(
		<TemplateSelector
			selectedTemplate={{ id: "simple-business-proposal", version: 1 }}
			onTemplateChange={onTemplateChange}
			installedThemes={installedThemes}
		/>,
	);
	fireEvent.pointerDown(view.getByRole("button", { name: /Simple Business Proposal/ }), {
		button: 0,
	});
	return { view, onTemplateChange };
};

it("lists the default templates and lets a published one be chosen", () => {
	const { view, onTemplateChange } = openSelector();

	expect(view.getAllByRole("menuitem")).toHaveLength(6);

	const available = view.getByRole("menuitem", { name: /Soft Skills Training/ });
	expect(available.hasAttribute("data-disabled")).toBe(false);
	fireEvent.click(available);
	expect(onTemplateChange).toHaveBeenCalledTimes(1);
});

it("adds installed marketplace binary references", () => {
	const { view, onTemplateChange } = openSelector(mock(), [
		{
			marketplaceId: "new-jeans-y2k-style",
			name: "New Jeans Y2K Style",
			description: "Installed template",
			templateReference: { id: "new-jeans-y2k-style", version: 1 },
			thumbnailPath: "pptx-templates/new-jeans-y2k-style/1/thumbnails/cover.webp",
		},
	]);

	const installed = view.getByRole("menuitem", { name: /New Jeans Y2K Style/ });
	fireEvent.click(installed);
	expect(onTemplateChange).toHaveBeenCalledWith({ id: "new-jeans-y2k-style", version: 1 });
});

// Publication is what makes a template usable, so one whose package was never
// uploaded has to stay unselectable however it reaches the menu.
it("disables an installed template version that has no published package", () => {
	const { view, onTemplateChange } = openSelector(mock(), [
		{
			marketplaceId: "strategic-media-planning",
			name: "Strategic Media Planning",
			description: "Unpublished version",
			templateReference: { id: "strategic-media-planning", version: 2 },
			thumbnailPath: "pptx-templates/strategic-media-planning/1/thumbnails/cover.webp",
		},
	]);

	const unavailable = view.getByRole("menuitem", { name: /Strategic Media Planning/ });
	expect(unavailable.hasAttribute("data-disabled")).toBe(true);
	fireEvent.click(unavailable);
	expect(onTemplateChange).not.toHaveBeenCalled();
});
