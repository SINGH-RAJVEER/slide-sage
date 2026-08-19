/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import type { SceneSlide } from "@slidesage/types";
import { EditableSceneCanvas } from "@slidesage/ui/components/Viewer/EditableSceneCanvas";
import { fireEvent, render } from "@testing-library/react";

const slide: SceneSlide = {
	id: "scene-1",
	type: "scene",
	semantic: { title: "Original title" },
	root: {
		id: "root",
		type: "group",
		order: 0,
		layout: "absolute",
		children: [
			{
				id: "title",
				type: "text",
				order: 0,
				role: "title",
				text: "Original title",
				bounds: { x: 80, y: 90, width: 720, height: 180 },
			},
		],
	},
};

it("emits an immutable pending scene draft after inline text editing", () => {
	const onChange = mock((_draft: SceneSlide) => undefined);
	const view = render(
		<EditableSceneCanvas slide={slide} currentTemplate="corporate-blue" onChange={onChange} />,
	);

	const title = view.getByRole("button", { name: "Original title" });
	fireEvent.click(title);
	expect(view.container.querySelector("[data-scene-selection-border='top']")).toBeInTheDocument();
	fireEvent.click(title);
	fireEvent.input(view.getByRole("textbox", { name: "Edit slide title text" }), {
		target: { value: "Edited title" },
	});
	expect(onChange).toHaveBeenCalledTimes(1);
	const pending = onChange.mock.calls[0]?.[0];
	expect(pending?.root.children[0]).toMatchObject({ text: "Edited title" });
	expect(pending?.semantic).toMatchObject({ title: "Edited title" });
	expect(slide.root.children[0]).toMatchObject({ text: "Original title" });
});

it("emits moved scene objects with all corners snapped to the canonical 8 pixel grid", () => {
	const onChange = mock((_draft: SceneSlide) => undefined);
	const view = render(
		<EditableSceneCanvas slide={slide} currentTemplate="corporate-blue" onChange={onChange} />,
	);
	const shell = view.container.querySelector(".ss-scene-edit-shell");
	if (!shell) throw new Error("Expected scene edit shell");
	Object.defineProperty(shell, "getBoundingClientRect", {
		value: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
	});

	fireEvent.click(view.getByRole("button", { name: "Original title" }));
	const border = view.container.querySelector("[data-scene-selection-border='top']");
	if (!border) throw new Error("Expected selected object border");
	fireEvent.pointerDown(border, {
		pointerId: 1,
		clientX: 80,
		clientY: 90,
	});
	expect(view.container.querySelector(".ss-scene-grid")).toBeInTheDocument();
	expect(view.container.querySelectorAll("[data-scene-snap-corner]")).toHaveLength(4);
	fireEvent.pointerMove(window, { pointerId: 1, clientX: 111, clientY: 123 });
	fireEvent.pointerUp(window, { pointerId: 1, clientX: 111, clientY: 123 });
	expect(view.container.querySelector(".ss-scene-grid")).toBeNull();
	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange.mock.calls[0]?.[0]?.root.children[0]).toMatchObject({
		bounds: { x: 112, y: 120, width: 720, height: 184 },
	});
});

it("resizes from a corner only after crossing the next grid threshold", () => {
	const onChange = mock((_draft: SceneSlide) => undefined);
	const view = render(
		<EditableSceneCanvas slide={slide} currentTemplate="corporate-blue" onChange={onChange} />,
	);
	const shell = view.container.querySelector(".ss-scene-edit-shell");
	if (!shell) throw new Error("Expected scene edit shell");
	Object.defineProperty(shell, "getBoundingClientRect", {
		value: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
	});

	fireEvent.click(view.getByRole("button", { name: "Original title" }));
	const handle = view.container.querySelector("[data-scene-resize-handle='bottom-right']");
	if (!handle) throw new Error("Expected bottom-right resize handle");
	fireEvent.pointerDown(handle, { pointerId: 1, clientX: 800, clientY: 270 });
	fireEvent.pointerMove(window, { pointerId: 1, clientX: 803, clientY: 273 });
	expect(view.container.querySelector(".ss-scene-selection")).toHaveStyle({
		width: "720px",
		height: "184px",
	});
	fireEvent.pointerMove(window, { pointerId: 1, clientX: 805, clientY: 275 });
	fireEvent.pointerUp(window, { pointerId: 1, clientX: 805, clientY: 275 });

	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange.mock.calls[0]?.[0]?.root.children[0]).toMatchObject({
		bounds: { x: 80, y: 88, width: 728, height: 192 },
	});
});
