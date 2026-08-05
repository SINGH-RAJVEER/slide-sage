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

	it("keeps text and semantic metadata synchronized across responsive roots", () => {
		const responsiveSlide: SceneSlide = {
			...slide,
			semantic: { title: "Before", subtitle: "Supporting text" },
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
								id: "title",
								type: "text",
								order: 0,
								role: "title",
								text: "Before",
							},
						],
					},
				},
			],
		};

		const changed = applySceneCommand(responsiveSlide, {
			type: "set-text",
			nodeId: "title",
			text: "After",
		});

		expect((findSceneNode(changed.root, "title") as { text: string }).text).toBe("After");
		expect(
			(
				findSceneNode(changed.variants?.[0]?.root as SceneSlide["root"], "title") as {
					text: string;
				}
			).text,
		).toBe("After");
		expect(changed.semantic).toEqual({ title: "After", subtitle: "Supporting text" });
		expect(
			(
				findSceneNode(responsiveSlide.variants?.[0]?.root as SceneSlide["root"], "title") as {
					text: string;
				}
			).text,
		).toBe("Before");
	});

	it("keeps widget text properties synchronized across responsive roots", () => {
		const widget = {
			id: "quote",
			type: "widget" as const,
			order: 0,
			kind: "quote" as const,
			version: 1,
			props: { text: "Before", attribution: "Author" },
		};
		const responsiveSlide: SceneSlide = {
			...slide,
			root: { ...slide.root, children: [widget] },
			variants: [
				{
					profile: "compact",
					patches: [],
					root: {
						...slide.root,
						id: "compact-root",
						children: [structuredClone(widget)],
					},
				},
			],
		};

		const changed = applySceneCommand(responsiveSlide, {
			type: "set-widget-props",
			nodeId: "quote",
			props: { text: "After", attribution: "Author" },
		});

		expect(findSceneNode(changed.root, "quote")).toMatchObject({ props: { text: "After" } });
		expect(findSceneNode(changed.variants?.[0]?.root as SceneSlide["root"], "quote")).toMatchObject(
			{ props: { text: "After" } },
		);
		expect(findSceneNode(responsiveSlide.root, "quote")).toMatchObject({
			props: { text: "Before" },
		});
	});
});
