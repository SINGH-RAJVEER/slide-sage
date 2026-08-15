/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import type { ContentSlide } from "@slidesage/types";
import { EditableSlideCanvas } from "@slidesage/ui/components/Viewer/EditableSlideCanvas";
import { fireEvent, render } from "@testing-library/react";

const slide: ContentSlide = {
	id: "cover-1",
	type: "content",
	layout: "cover",
	title: "Canonical cover",
	subtitle: "Rendered through the editorial layout",
	tone: "default",
	density: "standard",
	pattern: "none",
	blocks: [
		{ id: "copy", type: "paragraph", region: "main", text: "Foreground copy" },
		{
			id: "background",
			type: "image-placeholder",
			region: "media",
			alt: "Supporting visual",
			caption: "",
		},
	],
};

it("edits the background only after clicking unoccupied canonical slide space", () => {
	const onChange = mock((_slide: ContentSlide) => undefined);
	const view = render(
		<EditableSlideCanvas slide={slide} currentTemplate="corporate-blue" onChange={onChange} />,
	);

	expect(view.container.querySelector('[data-layout="cover"]')).toBeInTheDocument();
	fireEvent.click(view.getByText("Canonical cover"));
	expect(view.queryByText("Background visual")).toBeNull();
	fireEvent.click(view.getByText("Foreground copy"));
	expect(view.queryByText("Background visual")).toBeNull();

	fireEvent.click(view.container.querySelector('[data-layout="cover"]') as HTMLElement);
	expect(view.getByText("Background visual")).toBeInTheDocument();
	fireEvent.change(view.getByLabelText("Image URL"), {
		target: { value: "https://images.example.com/cover.jpg" },
	});

	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange.mock.calls[0]?.[0].blocks[1]).toMatchObject({
		type: "image",
		url: "https://images.example.com/cover.jpg",
	});
});

it("moves canonical content objects on the 8 pixel slide grid", () => {
	const onChange = mock((_slide: ContentSlide) => undefined);
	const view = render(
		<EditableSlideCanvas slide={slide} currentTemplate="corporate-blue" onChange={onChange} />,
	);
	const shell = view.container.querySelector(".ss-content-edit-shell");
	const title = view.getByRole("button", { name: "Canonical cover" });
	const titleFrame = title.closest("[data-content-object-id]");
	if (!shell || !titleFrame) throw new Error("Expected canonical content editing elements");
	Object.defineProperty(shell, "getBoundingClientRect", {
		value: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
	});
	Object.defineProperty(titleFrame, "getBoundingClientRect", {
		value: () => ({ left: 80, top: 90, width: 720, height: 180 }),
	});

	fireEvent.click(title);
	const border = view.container.querySelector("[data-content-selection-border='top']");
	if (!border) throw new Error("Expected title selection border");
	fireEvent.pointerDown(border, { pointerId: 1, clientX: 80, clientY: 90 });
	fireEvent.pointerMove(window, { pointerId: 1, clientX: 111, clientY: 123 });
	fireEvent.pointerUp(window, { pointerId: 1, clientX: 111, clientY: 123 });

	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange.mock.calls[0]?.[0].titleBounds).toEqual({
		x: 112,
		y: 120,
		width: 720,
		height: 184,
	});
	expect(view.getByRole("button", { name: "Canonical cover" })).toBeInTheDocument();
	expect(view.container.querySelector(".ss-content-selection")).toBeInTheDocument();
});
