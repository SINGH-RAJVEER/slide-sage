import { describe, expect, it } from "bun:test";
import { isSceneSlide } from "@slidesage/types";
import {
	applyPresentationMutations,
	normalizePresentationDocument,
	parsePresentationMutationRequest,
} from "../../services/presentation-document";

const legacyDocument = {
	schemaVersion: 2,
	title: "Legacy deck",
	theme: "corporate-blue",
	slides: [
		{
			id: "slide-1",
			type: "content",
			layout: "content",
			title: "Introduction",
			subtitle: "",
			blocks: [{ type: "paragraph", region: "main", text: "Hello" }],
		},
		{
			id: "slide-2",
			type: "content",
			layout: "content",
			title: "Next",
			subtitle: "",
			blocks: [],
		},
	],
};

describe("presentation document", () => {
	it("upcasts legacy documents with deterministic identities", () => {
		const first = normalizePresentationDocument(legacyDocument);
		const second = normalizePresentationDocument(legacyDocument);

		expect(first.schemaVersion).toBe(5);
		expect(first.slides[0] && "layout" in first.slides[0] ? first.slides[0].layout : null).toBe(
			"body"
		);
		expect(first.dimensions).toEqual({ width: 1280, height: 720 });
		expect(
			first.slides[0] && "blocks" in first.slides[0] ? first.slides[0].blocks[0]?.id : null
		).toBe("slide-1-block-1");
		expect(first).toEqual(second);
	});

	it("maps every legacy layout and column region into schema v5", () => {
		const document = normalizePresentationDocument({
			...legacyDocument,
			slides: [
				{ ...legacyDocument.slides[0], id: "title", layout: "title" },
				{ ...legacyDocument.slides[0], id: "content", layout: "content" },
				{
					...legacyDocument.slides[0],
					id: "columns",
					layout: "two-column",
					blocks: [
						{ type: "paragraph", region: "left", text: "A" },
						{ type: "paragraph", region: "right", text: "B" },
					],
				},
				{
					...legacyDocument.slides[0],
					id: "image",
					layout: "image-right",
					blocks: [{ type: "image-placeholder", region: "right", alt: "Visual" }],
				},
			],
		});
		const contentSlides = document.slides.filter((slide) => "layout" in slide);

		expect(contentSlides.map((slide) => slide.layout)).toEqual([
			"cover",
			"body",
			"split",
			"media-right",
		]);
		expect(contentSlides[2]?.blocks.map((block) => block.region)).toEqual(["primary", "secondary"]);
		expect(contentSlides[3]?.blocks[0]?.region).toBe("media");
		expect(contentSlides.every((slide) => slide.tone === "default")).toBe(true);
	});

	it("applies updates, reordering, and deletion as one document operation", () => {
		const document = normalizePresentationDocument(legacyDocument);
		const firstSlide = document.slides[0];
		if (!firstSlide) throw new Error("Expected the fixture to contain a slide");
		const updatedSlide = { ...firstSlide, title: "Updated opening" };
		const next = applyPresentationMutations(document, [
			{ type: "update-presentation", theme: "nature-green" },
			{ type: "update-slide", slideId: "slide-1", slide: updatedSlide },
			{ type: "reorder-slides", slideIds: ["slide-2", "slide-1"] },
			{ type: "delete-slide", slideId: "slide-2" },
		]);

		expect(next.theme).toBe("nature-green");
		expect(next.totalSlides).toBe(1);
		expect(next.slides[0]?.id).toBe("slide-1");
		expect(next.slides[0] && "title" in next.slides[0] ? next.slides[0].title : "").toBe(
			"Updated opening"
		);
	});

	it("rejects incomplete reorder operations and deleting the final slide", () => {
		const document = normalizePresentationDocument(legacyDocument);
		expect(() =>
			applyPresentationMutations(document, [{ type: "reorder-slides", slideIds: ["slide-1"] }])
		).toThrow("every slide exactly once");
		const single = applyPresentationMutations(document, [
			{ type: "delete-slide", slideId: "slide-2" },
		]);
		expect(() =>
			applyPresentationMutations(single, [{ type: "delete-slide", slideId: "slide-1" }])
		).toThrow("at least one slide");
	});

	it("validates mutation request shapes", () => {
		expect(
			parsePresentationMutationRequest({
				mutations: [{ type: "delete-slide", slideId: "slide-1" }],
			})
		).toEqual({ mutations: [{ type: "delete-slide", slideId: "slide-1" }] });
		expect(() => parsePresentationMutationRequest({ mutations: [] })).toThrow(
			"At least one presentation mutation"
		);
		expect(() =>
			parsePresentationMutationRequest({
				mutations: Array.from({ length: 51 }, () => ({
					type: "delete-slide",
					slideId: "slide-1",
				})),
			})
		).toThrow("more than 50 mutations");
	});

	it("drops malformed stored slides and sanitizes malformed slide updates", () => {
		const document = normalizePresentationDocument({
			...legacyDocument,
			slides: [null, ...legacyDocument.slides],
		});
		expect(document.slides).toHaveLength(2);
		const next = applyPresentationMutations(document, [
			{
				type: "update-slide",
				slideId: "slide-1",
				slide: { id: "slide-1", type: "content" } as never,
			},
		]);
		const slide = next.slides[0];
		expect(slide?.type).toBe("content");
		expect(slide && "blocks" in slide ? slide.blocks : null).toEqual([]);
		expect(() =>
			applyPresentationMutations(document, [
				{
					type: "update-slide",
					slideId: "slide-1",
					slide: { id: "slide-1", type: "unsupported" } as never,
				},
			])
		).toThrow("Invalid slide update");
		expect(document.slides).toHaveLength(2);
	});

	it("preserves block identity after an invalid preceding block", () => {
		const document = normalizePresentationDocument({
			...legacyDocument,
			slides: [
				{
					...legacyDocument.slides[0],
					blocks: [
						{ id: "invalid", type: "unsupported", region: "main" },
						{
							id: "kept",
							type: "paragraph",
							region: "main",
							sourceIds: ["source-1"],
							text: "Kept content",
						},
					],
				},
			],
		});
		const slide = document.slides[0];
		const block = slide && "blocks" in slide ? slide.blocks[0] : undefined;

		expect(block?.id).toBe("kept");
		expect(block?.sourceIds).toEqual(["source-1"]);
	});

	it("loads v3 widgets and stores only normalized v5 semantic data", () => {
		const document = normalizePresentationDocument({
			schemaVersion: 3,
			title: "Widget deck",
			theme: "minimalist",
			slides: [
				{
					id: "slide-1",
					type: "content",
					layout: "content",
					title: "System flow",
					subtitle: "",
					blocks: [
						{
							id: "widget-1",
							type: "widget",
							region: "main",
							kind: "flow",
							direction: "diagonal",
							url: "https://example.com/widget",
							style: { color: "red" },
							nodes: [
								{
									id: "client",
									label: "Client",
									description: "Starts a request",
									role: "actor",
									tone: "accent",
									html: "<b>Client</b>",
								},
								{
									id: "api",
									label: "API",
									description: "Handles it",
									role: "unsupported",
									tone: "unsupported",
								},
							],
							edges: [
								{ from: "client", to: "api", label: "HTTPS", style: "bold" },
								{ from: "client", to: "missing", label: "Invalid" },
							],
						},
					],
				},
			],
		});
		const slide = document.slides[0];
		const widget = slide && "blocks" in slide ? slide.blocks[0] : undefined;

		expect(document.schemaVersion).toBe(5);
		expect(widget).toEqual({
			id: "widget-1",
			sourceIds: [],
			type: "widget",
			region: "main",
			emphasis: "standard",
			treatment: "plain",
			version: 1,
			kind: "flow",
			direction: "horizontal",
			nodes: [
				{
					id: "client",
					label: "Client",
					description: "Starts a request",
					value: "",
					role: "actor",
					tone: "accent",
					parentId: "",
				},
				{
					id: "api",
					label: "API",
					description: "Handles it",
					value: "",
					role: "default",
					tone: "neutral",
					parentId: "",
				},
			],
			edges: [{ from: "client", to: "api", label: "HTTPS" }],
		});
	});

	it("round trips scene versions and responsive patches", () => {
		const document = normalizePresentationDocument({
			schemaVersion: 6,
			engineVersion: "1.0.0",
			title: "Scene deck",
			theme: "modern-dark",
			slides: [
				{
					id: "scene-1",
					type: "scene",
					root: {
						id: "root",
						type: "group",
						order: 0,
						layout: "stack",
						align: "center",
						distribute: "space-between",
						children: [{ id: "title", type: "text", order: 0, role: "title", text: "Title" }],
					},
					variants: [
						{
							profile: "compact",
							patches: [{ nodeId: "title", hidden: true, order: 2 }],
						},
					],
				},
			],
		});

		expect(document.schemaVersion).toBe(6);
		expect(document["engineVersion"]).toBe("1.0.0");
		const slide = document.slides[0];
		expect(slide && "root" in slide ? slide.root.align : undefined).toBe("center");
		expect(slide && "root" in slide ? slide.root.distribute : undefined).toBe("space-between");
		expect(slide && "root" in slide ? slide.variants?.[0]?.patches[0] : undefined).toEqual(
			expect.objectContaining({ nodeId: "title", hidden: true, order: 2 })
		);
	});

	it("persists edited scene text through normalized slide updates", () => {
		const document = normalizePresentationDocument({
			schemaVersion: 6,
			title: "Scene deck",
			theme: "modern-dark",
			slides: [
				{
					id: "scene-1",
					type: "scene",
					semantic: { title: "Edited title" },
					root: {
						id: "root",
						type: "group",
						order: 0,
						layout: "stack",
						children: [
							{
								id: "title",
								type: "text",
								order: 0,
								role: "title",
								text: "Original title",
							},
						],
					},
				},
			],
		});
		const current = document.slides[0];
		if (!current || !isSceneSlide(current)) throw new Error("Expected a scene slide");
		const updated = {
			...current,
			root: {
				...current.root,
				children: current.root.children.map((node) =>
					node.id === "title" && node.type === "text" ? { ...node, text: "Edited title" } : node
				),
			},
		};

		const saved = applyPresentationMutations(document, [
			{ type: "update-slide", slideId: current.id, slide: updated },
		]);
		const savedSlide = saved.slides[0];

		expect(
			savedSlide && isSceneSlide(savedSlide) && savedSlide.root.children[0]?.type === "text"
				? savedSlide.root.children[0].text
				: undefined
		).toBe("Edited title");
		expect(
			savedSlide && isSceneSlide(savedSlide) ? savedSlide.semantic?.["title"] : undefined
		).toBe("Edited title");
	});
});
