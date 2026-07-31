/// <reference lib="dom" />

import { expect, it } from "bun:test";
import { SceneRenderer } from "@slide-sage/ui/components/Viewer/SceneRenderer";
import { fireEvent, render } from "@testing-library/react";

it("renders arbitrary scene nodes, art direction, and widgets", () => {
    const view = render(
        <SceneRenderer
            currentTemplate="corporate-blue"
            isActive={true}
            slide={{
                id: "scene-1",
                type: "scene",
                artDirection: { background: "#123456", accent: "#ff5500" },
                root: {
                    id: "root",
                    type: "group",
                    order: 0,
                    layout: "absolute",
                    children: [
                        {
                            id: "headline",
                            type: "text",
                            order: 0,
                            role: "display",
                            text: "An authored scene",
                            bounds: { x: 80, y: 90, width: 720, height: 180 },
                        },
                        {
                            id: "metrics",
                            type: "widget",
                            order: 1,
                            kind: "stats",
                            version: 1,
                            bounds: { x: 80, y: 380, width: 900, height: 180 },
                            props: { items: [{ value: "42%", label: "Faster" }] },
                        },
                    ],
                },
            }}
        />,
    );

    expect(view.getByText("An authored scene")).toBeInTheDocument();
    expect(view.getByText("42%")).toBeInTheDocument();
    expect(view.container.querySelector("[data-scene-slide-id='scene-1']")).toHaveStyle({
        background: "#123456",
    });
});

it("applies the requested responsive scene variant", () => {
    const view = render(
        <SceneRenderer
            currentTemplate="corporate-blue"
            isActive={true}
            profile="compact"
            slide={{
                id: "responsive-scene",
                type: "scene",
                root: {
                    id: "wide-root",
                    type: "group",
                    order: 0,
                    layout: "absolute",
                    children: [
                        {
                            id: "wide-title",
                            type: "text",
                            order: 0,
                            role: "title",
                            text: "Wide composition",
                            bounds: { x: 80, y: 90, width: 720, height: 180 },
                        },
                    ],
                },
                variants: [
                    {
                        profile: "compact",
                        patches: [],
                        root: {
                            id: "compact-root",
                            type: "group",
                            order: 0,
                            layout: "stack",
                            children: [
                                {
                                    id: "compact-title",
                                    type: "text",
                                    order: 0,
                                    role: "title",
                                    text: "Compact composition",
                                },
                            ],
                        },
                    },
                ],
            }}
        />,
    );

    expect(view.getByText("Compact composition")).toBeInTheDocument();
    expect(view.queryByText("Wide composition")).toBeNull();
    expect(view.container.querySelector("[data-scene-profile='compact']")).toBeInTheDocument();
});

it("renders semantic diagram nodes from generated widget props", () => {
    const view = render(
        <SceneRenderer
            currentTemplate="corporate-blue"
            isActive={true}
            slide={{
                id: "diagram-scene",
                type: "scene",
                root: {
                    id: "diagram-root",
                    type: "group",
                    order: 0,
                    layout: "absolute",
                    children: [
                        {
                            id: "process",
                            type: "widget",
                            order: 0,
                            kind: "process",
                            version: 1,
                            bounds: { x: 80, y: 80, width: 1120, height: 520 },
                            props: {
                                nodes: [
                                    { label: "Plan", description: "Set direction" },
                                    { label: "Ship", description: "Deliver value" },
                                ],
                            },
                        },
                    ],
                },
            }}
        />,
    );

    expect(view.getByText("Plan")).toBeInTheDocument();
    expect(view.getByText("Ship")).toBeInTheDocument();
});

it("allows scene text to be selected and edited when editing callbacks are provided", () => {
    const edits: Array<{ nodeId: string; text: string }> = [];
    const view = render(
        <SceneRenderer
            currentTemplate="corporate-blue"
            isActive={true}
            editingTarget="headline"
            onSelectText={() => undefined}
            onEditText={(nodeId, text) => edits.push({ nodeId, text })}
            slide={{
                id: "editable-scene",
                type: "scene",
                root: {
                    id: "root",
                    type: "group",
                    order: 0,
                    layout: "absolute",
                    children: [
                        {
                            id: "headline",
                            type: "text",
                            order: 0,
                            role: "title",
                            text: "Original title",
                            bounds: { x: 80, y: 90, width: 720, height: 180 },
                        },
                    ],
                },
            }}
        />,
    );

    const editor = view.getByRole("textbox", { name: "Edit slide title text" });
    fireEvent.input(editor, { target: { value: "Edited title" } });

    expect(edits).toEqual([{ nodeId: "headline", text: "Edited title" }]);
});

it("edits structured text without flattening scene widgets", () => {
    const edits: Array<{ nodeId: string; props: Record<string, unknown> }> = [];
    const view = render(
        <SceneRenderer
            currentTemplate="corporate-blue"
            isActive={true}
            editingTarget="quote"
            onSelectWidget={() => undefined}
            onEditWidget={(nodeId, props) => edits.push({ nodeId, props })}
            slide={{
                id: "editable-widget-scene",
                type: "scene",
                root: {
                    id: "root",
                    type: "group",
                    order: 0,
                    layout: "absolute",
                    children: [
                        {
                            id: "quote",
                            type: "widget",
                            order: 0,
                            kind: "quote",
                            version: 1,
                            bounds: { x: 80, y: 90, width: 720, height: 300 },
                            props: { text: "Original quote", attribution: "Author" },
                        },
                    ],
                },
            }}
        />,
    );

    fireEvent.input(view.getByRole("textbox", { name: "Edit quote text" }), {
        target: { value: "Edited quote" },
    });

    expect(edits).toEqual([
        {
            nodeId: "quote",
            props: { text: "Edited quote", attribution: "Author" },
        },
    ]);
});
