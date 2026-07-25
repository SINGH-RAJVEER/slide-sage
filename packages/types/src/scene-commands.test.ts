import { describe, expect, it } from "bun:test";
import type { SceneSlide } from "./scene";
import { applySceneCommand, findSceneNode, invertSceneCommand } from "./scene-commands";

const slide: SceneSlide = {
    id: "slide-1",
    type: "scene",
    root: {
        id: "root",
        type: "group",
        order: 0,
        layout: "stack",
        children: [{ id: "title", type: "text", order: 0, role: "title", text: "Before" }],
    },
};

describe("scene commands", () => {
    it("applies and reverses text commands without mutating the source", () => {
        const command = { type: "set-text", nodeId: "title", text: "After" } as const;
        const inverse = invertSceneCommand(slide, command);
        const changed = applySceneCommand(slide, command);
        const restored = inverse ? applySceneCommand(changed, inverse) : changed;

        expect((findSceneNode(changed.root, "title") as { text: string }).text).toBe("After");
        expect((findSceneNode(slide.root, "title") as { text: string }).text).toBe("Before");
        expect(restored).toEqual(slide);
    });

    it("stores responsive overrides independently from base geometry", () => {
        const changed = applySceneCommand(slide, {
            type: "set-responsive-override",
            profile: "compact",
            patch: { nodeId: "title", hidden: true },
        });

        expect(changed.variants?.[0]?.patches[0]).toEqual({ nodeId: "title", hidden: true });
        expect(findSceneNode(changed.root, "title")?.hidden).toBeUndefined();
    });
});
