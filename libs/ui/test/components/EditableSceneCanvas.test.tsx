/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import type { SceneSlide } from "@slidesage/types";
import { EditableSceneCanvas } from "@slidesage/ui/components/Viewer/EditableSceneCanvas";
import { fireEvent, render, waitFor } from "@testing-library/react";

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

it("saves an immutable scene draft after inline text editing", async () => {
    const onSave = mock(async (_draft: SceneSlide) => undefined);
    const view = render(
        <EditableSceneCanvas
            slide={slide}
            currentTemplate="corporate-blue"
            saving={false}
            onSave={onSave}
            onCancel={() => undefined}
        />,
    );

    fireEvent.click(view.getByRole("button", { name: "Original title" }));
    fireEvent.input(view.getByRole("textbox", { name: "Edit slide title text" }), {
        target: { value: "Edited title" },
    });
    fireEvent.click(view.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved?.root.children[0]).toMatchObject({ text: "Edited title" });
    expect(saved?.semantic).toMatchObject({ title: "Edited title" });
    expect(slide.root.children[0]).toMatchObject({ text: "Original title" });
});
