/// <reference lib="dom" />

import { expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { SceneRenderer } from "@/components/Viewer/SceneRenderer";

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
