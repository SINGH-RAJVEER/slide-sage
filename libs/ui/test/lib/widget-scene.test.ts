import { describe, expect, it } from "bun:test";
import { compileWidgetScene, normalizeWidgetSpec } from "@slide-sage/ui/lib/widget-scene";

const widget = {
    type: "widget",
    region: "main",
    version: 1,
    kind: "flow",
    direction: "horizontal",
    nodes: [
        { id: "discover", role: "start", label: "Discover demand" },
        { id: "deliver", role: "end", label: "Deliver value", value: "2x" },
    ],
    edges: [
        { from: "discover", to: "deliver", label: "then" },
        { from: "missing", to: "deliver" },
    ],
};

describe("widget scene compiler", () => {
    it("produces deterministic bounded geometry and removes dangling edges", () => {
        const first = compileWidgetScene(widget);
        const second = compileWidgetScene(structuredClone(widget));

        expect(second).toEqual(first);
        expect(first).toMatchObject({ width: 1120, height: 420, kind: "flow" });
        expect(first.nodes).toHaveLength(2);
        expect(first.edges).toHaveLength(1);
        expect(first.edges[0]?.points.length).toBeGreaterThan(1);
        expect(first.nodes.every((node) => node.x >= 0 && node.x + node.width <= first.width)).toBe(
            true,
        );
    });

    it("supports compact column geometry and direct spec fields", () => {
        const scene = compileWidgetScene(widget, "column");

        expect(scene).toMatchObject({ width: 540, height: 500 });
        expect(scene.nodes.map((node) => node.label)).toEqual(["Discover demand", "Deliver value"]);
    });

    it("accepts the shared direct widget block", () => {
        const scene = compileWidgetScene({
            type: "widget",
            region: "main",
            version: 1,
            kind: "timeline",
            direction: "horizontal",
            nodes: [
                {
                    id: "alpha",
                    role: "start",
                    label: "Alpha",
                    description: "Internal validation",
                    tone: "accent",
                },
                {
                    id: "ga",
                    role: "end",
                    label: "General availability",
                    description: "Public release",
                    tone: "positive",
                },
            ],
            edges: [{ from: "alpha", to: "ga", label: "promote" }],
        });

        expect(scene.warning).toBeUndefined();
        expect(scene.edges[0]).toMatchObject({ from: "alpha", to: "ga", label: "promote" });
    });

    it("rejects unsupported versions with an explicit fallback scene", () => {
        const invalid = { ...widget, version: 2 };

        expect(normalizeWidgetSpec(invalid)).toBeNull();
        expect(compileWidgetScene(invalid).warning).toBe(
            "This generated widget could not be displayed.",
        );
    });
});
