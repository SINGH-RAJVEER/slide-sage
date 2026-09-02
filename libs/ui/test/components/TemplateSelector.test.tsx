/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import TemplateSelector from "@slidesage/ui/components/Viewer/TemplateSelector";
import { fireEvent, render } from "@testing-library/react";

it("lists six defaults and selects a typed binary template", () => {
	const onTemplateChange = mock();
	const view = render(
		<TemplateSelector
			selectedTemplate={{
				id: "simple-business-proposal",
				version: 1,
				previewThemeId: "corporate-blue",
			}}
			onTemplateChange={onTemplateChange}
		/>,
	);

	fireEvent.pointerDown(view.getByRole("button", { name: /Simple Business Proposal/ }), {
		button: 0,
	});

	expect(view.getAllByRole("menuitem")).toHaveLength(6);
	fireEvent.click(view.getByRole("menuitem", { name: /Soft Skills Training/ }));
	expect(onTemplateChange).toHaveBeenCalledWith({
		id: "soft-skills-training",
		version: 1,
		previewThemeId: "terra-mesa",
	});
});

it("adds installed marketplace binary references", () => {
	const onTemplateChange = mock();
	const view = render(
		<TemplateSelector
			selectedTemplate={{
				id: "simple-business-proposal",
				version: 1,
				previewThemeId: "corporate-blue",
			}}
			onTemplateChange={onTemplateChange}
			installedThemes={[
				{
					marketplaceId: "new-jeans-y2k-style",
					name: "New Jeans Y2K Style",
					description: "Installed template",
					templateReference: { id: "new-jeans-y2k-style", version: 1 },
					previewThemeId: "bubblegum-pop",
				},
			]}
		/>,
	);

	fireEvent.pointerDown(view.getByRole("button", { name: /Simple Business Proposal/ }), {
		button: 0,
	});
	fireEvent.click(view.getByRole("menuitem", { name: /New Jeans Y2K Style/ }));

	expect(onTemplateChange).toHaveBeenCalledWith({
		id: "new-jeans-y2k-style",
		version: 1,
		previewThemeId: "bubblegum-pop",
	});
});
