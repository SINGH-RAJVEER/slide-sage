import { describe, expect, it } from "bun:test";
import type { ContentSlide, PresentationData, SlideBlock, SlideLayout } from "@slidesage/types";
import {
	type OoxmlTemplateManifest,
	renderOoxmlTemplate,
} from "@slidesage/ui/lib/ooxml-template-renderer";
import { DOMParser as OoxmlDomParser } from "@xmldom/xmldom";
import JSZip from "jszip";

const RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOCUMENT_RELATIONSHIPS =
	"http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PRESENTATION = "http://schemas.openxmlformats.org/presentationml/2006/main";
const DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main";

function contentSlide(layout: SlideLayout, title: string, subtitle: string): ContentSlide {
	return {
		id: `${layout}-${title}`,
		type: "content",
		layout,
		title,
		subtitle,
		tone: "default",
		density: "standard",
		pattern: "none",
		blocks: [],
	};
}

function presentation(slides: ContentSlide[]): PresentationData {
	return {
		title: "Rendered deck",
		theme: "corporate-blue",
		totalSlides: slides.length,
		slides,
	};
}

const manifest: OoxmlTemplateManifest = {
	layouts: {
		cover: {
			sourceSlideNumber: 1,
			textSlots: {
				title: { shapeId: 11, value: "slide.title" },
				subtitle: { shapeId: 12, value: "slide.subtitle" },
			},
		},
		body: {
			sourceSlideNumber: 2,
			textSlots: {
				title: { shapeId: 21, value: "slide.title" },
			},
		},
	},
};

async function tinyTemplate(reverseNotesRelationship = true): Promise<Uint8Array> {
	const zip = new JSZip();
	zip.file(
		"[Content_Types].xml",
		`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
	<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
	<Default Extension="xml" ContentType="application/xml"/>
	<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
	<Override PartName="/ppt/slides/slide7.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
	<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
	<Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>
</Types>`,
	);
	zip.file(
		"_rels/.rels",
		`<Relationships xmlns="${RELATIONSHIPS}">
	<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
	);
	zip.file(
		"ppt/presentation.xml",
		`<p:presentation xmlns:p="${PRESENTATION}" xmlns:r="${DOCUMENT_RELATIONSHIPS}" xmlns:x="urn:fixture:unknown">
	<p:sldIdLst><p:sldId id="400" r:id="rId3"/><p:sldId id="900" r:id="rId9"/></p:sldIdLst>
	<x:keep value="yes"/>
</p:presentation>`,
	);
	zip.file(
		"ppt/_rels/presentation.xml.rels",
		`<Relationships xmlns="${RELATIONSHIPS}">
	<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
	<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide7.xml"/>
	<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`,
	);
	zip.file("ppt/theme/theme1.xml", "<theme/>");
	zip.file("ppt/slideLayouts/slideLayout1.xml", "<layout/>");
	zip.file("ppt/slideLayouts/slideLayout2.xml", "<layout/>");
	zip.file("ppt/notesMasters/notesMaster1.xml", "<master/>");
	zip.file("ppt/media/image1.png", new Uint8Array([1, 2, 3]));
	zip.file("ppt/notesSlides/notesSlide1.xml", `<p:notes xmlns:p="${PRESENTATION}"/>`);
	zip.file(
		"ppt/notesSlides/_rels/notesSlide1.xml.rels",
		notesRelationships(reverseNotesRelationship),
	);
	zip.file("ppt/custom/unknown.xml", "<unknown/>");
	zip.file("ppt/slides/slide7.xml", slideXml(11, 12, "Cover", " template", "cover"));
	zip.file(
		"ppt/slides/slide2.xml",
		slideXml(
			21,
			22,
			"Body",
			" template",
			"body",
			`${textShape(23, "Secondary")}${textShape(24, "Media")}`,
		),
	);
	zip.file("ppt/slides/_rels/slide7.xml.rels", slideRelationships("slideLayout1.xml", true));
	zip.file("ppt/slides/_rels/slide2.xml.rels", slideRelationships("slideLayout2.xml", false));
	return zip.generateAsync({ type: "uint8array" });
}

function slideXml(
	titleId: number,
	subtitleId: number,
	firstRun: string,
	secondRun: string,
	marker: string,
	extraShapes = "",
) {
	return `<p:sld xmlns:p="${PRESENTATION}" xmlns:a="${DRAWING}" xmlns:u="urn:fixture:unknown">
	<p:cSld><p:spTree>
		${textShape(titleId, `${firstRun}</a:t></a:r><a:r><a:t>${secondRun}`)}
		${textShape(subtitleId, "Subtitle")}
		${extraShapes}
		<u:preserved marker="${marker}"/>
	</p:spTree></p:cSld>
</p:sld>`;
}

function textShape(id: number, text: string) {
	return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="shape-${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
}

function slideRelationships(layout: string, includeDependencies: boolean) {
	const dependencies = includeDependencies
		? `
	<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
	<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
	<Relationship Id="rId4" Type="urn:fixture:unknown" Target="../custom/unknown.xml"/>`
		: "";
	return `<Relationships xmlns="${RELATIONSHIPS}">
	<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/${layout}"/>${dependencies}
</Relationships>`;
}

function notesRelationships(reverseSlideRelationship: boolean) {
	const reverse = reverseSlideRelationship
		? `
	<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide7.xml"/>`
		: "";
	return `<Relationships xmlns="${RELATIONSHIPS}">
	<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/>
	<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>${reverse}
</Relationships>`;
}

function parse(xml: string): Document {
	return new OoxmlDomParser().parseFromString(xml, "application/xml") as unknown as Document;
}

async function zipText(zip: JSZip, path: string): Promise<string> {
	const file = zip.file(path);
	if (!file) {
		throw new Error(`Expected fixture output part "${path}"`);
	}
	return file.async("string");
}

function elements(root: Document | Element, namespace: string, localName: string): Element[] {
	const namespaceMatches = Array.from(
		root.getElementsByTagNameNS(namespace, localName),
	) as Element[];
	if (namespaceMatches.length > 0) {
		return namespaceMatches;
	}
	return (Array.from(root.getElementsByTagName("*")) as Element[]).filter(
		(element) => element.namespaceURI === namespace && element.localName === localName,
	);
}

describe("renderOoxmlTemplate", () => {
	it("clones relationship-ordered source slides with unique package and presentation IDs", async () => {
		const template = await tinyTemplate();
		const output = await renderOoxmlTemplate(
			template,
			manifest,
			presentation([
				contentSlide("body", "First body", "Body subtitle"),
				contentSlide("cover", "Second cover", "Cover subtitle"),
			]),
		);
		const zip = await JSZip.loadAsync(output);
		const presentationXml = parse(await zipText(zip, "ppt/presentation.xml"));
		const presentationRels = parse(await zipText(zip, "ppt/_rels/presentation.xml.rels"));
		const slideIds = elements(presentationXml, PRESENTATION, "sldId");
		const relationships = elements(presentationRels, RELATIONSHIPS, "Relationship");
		const slideRelationships = relationships.filter((relationship) =>
			relationship.getAttribute("Type")?.endsWith("/slide"),
		);

		expect(slideIds.map((slideId) => slideId.getAttribute("id"))).toEqual(["901", "902"]);
		expect(
			slideIds.map(
				(slideId) =>
					slideId.getAttributeNS(DOCUMENT_RELATIONSHIPS, "id") ?? slideId.getAttribute("r:id"),
			),
		).toEqual(["rId10", "rId11"]);
		expect(slideRelationships.map((relationship) => relationship.getAttribute("Target"))).toEqual([
			"slides/slide8.xml",
			"slides/slide9.xml",
		]);
		expect(new Set(relationships.map((relationship) => relationship.getAttribute("Id"))).size).toBe(
			relationships.length,
		);
		expect(await zipText(zip, "ppt/slides/slide8.xml")).toContain('marker="body"');
		expect(await zipText(zip, "ppt/slides/slide8.xml")).toContain("First body");
		expect(await zipText(zip, "ppt/slides/slide9.xml")).toContain('marker="cover"');
		expect(await zipText(zip, "ppt/slides/slide7.xml")).toContain("Cover");
		expect(await zipText(zip, "ppt/slides/slide2.xml")).toContain("Body");
	});

	it("replaces split text runs, preserves unknown XML, and clones all source relationships", async () => {
		const template = await tinyTemplate();
		const output = await renderOoxmlTemplate(
			template,
			manifest,
			presentation([contentSlide("cover", "A complete title", "New subtitle")]),
		);
		const zip = await JSZip.loadAsync(output);
		const slideXml = await zipText(zip, "ppt/slides/slide8.xml");
		const slide = parse(slideXml);
		const text = elements(slide, DRAWING, "t").map((node) => node.textContent);

		expect(text).toEqual(["A complete title", "", "New subtitle"]);
		expect(slideXml).toContain('marker="cover"');
		const clonedRelationships = await zipText(zip, "ppt/slides/_rels/slide8.xml.rels");
		expect(clonedRelationships).toContain("../notesSlides/notesSlide2.xml");
		expect(clonedRelationships).toContain("../media/image1.png");
		expect(zip.file("ppt/media/image1.png")).not.toBeNull();
		expect(zip.file("ppt/notesSlides/notesSlide1.xml")).not.toBeNull();
		expect(zip.file("ppt/custom/unknown.xml")).not.toBeNull();

		const contentTypes = parse(await zipText(zip, "[Content_Types].xml"));
		const overrides = elements(
			contentTypes,
			"http://schemas.openxmlformats.org/package/2006/content-types",
			"Override",
		);
		expect(
			overrides.some((override) => override.getAttribute("PartName") === "/ppt/slides/slide8.xml"),
		).toBe(true);
		expect(
			overrides.some(
				(override) => override.getAttribute("PartName") === "/ppt/notesSlides/notesSlide2.xml",
			),
		).toBe(true);
		expect(new Set(overrides.map((override) => override.getAttribute("PartName"))).size).toBe(
			overrides.length,
		);
	});

	it("clones a unique notes slide per generated slide and rewrites reverse slide relationships", async () => {
		const output = await renderOoxmlTemplate(
			await tinyTemplate(),
			manifest,
			presentation([
				contentSlide("cover", "First", "Notes"),
				contentSlide("cover", "Second", "Notes"),
			]),
		);
		const zip = await JSZip.loadAsync(output);
		for (const [slideNumber, notesNumber] of [
			[8, 2],
			[9, 3],
		] as const) {
			const slideRels = await zipText(zip, `ppt/slides/_rels/slide${slideNumber}.xml.rels`);
			expect(slideRels).toContain(`../notesSlides/notesSlide${notesNumber}.xml`);
			const notesRels = await zipText(
				zip,
				`ppt/notesSlides/_rels/notesSlide${notesNumber}.xml.rels`,
			);
			expect(notesRels).toContain(`../slides/slide${slideNumber}.xml`);
			expect(notesRels).toContain("../notesMasters/notesMaster1.xml");
			expect(notesRels).toContain("../media/image1.png");
		}
		expect(zip.file("ppt/notesSlides/notesSlide2.xml")).not.toBeNull();
		expect(zip.file("ppt/notesSlides/notesSlide3.xml")).not.toBeNull();
		expect(await zipText(zip, "ppt/notesSlides/notesSlide1.xml")).toContain("p:notes");
	});

	it("clones notes relationships when the source has no reverse slide relationship", async () => {
		const output = await renderOoxmlTemplate(
			await tinyTemplate(false),
			manifest,
			presentation([contentSlide("cover", "No reverse", "Notes")]),
		);
		const zip = await JSZip.loadAsync(output);
		const notesRels = parse(await zipText(zip, "ppt/notesSlides/_rels/notesSlide2.xml.rels"));
		const relationshipTypes = elements(notesRels, RELATIONSHIPS, "Relationship").map(
			(relationship) => relationship.getAttribute("Type"),
		);
		expect(relationshipTypes.some((type) => type?.endsWith("/slide"))).toBe(false);
		expect(relationshipTypes.some((type) => type?.endsWith("/notesMaster"))).toBe(true);
		expect(relationshipTypes.some((type) => type?.endsWith("/image"))).toBe(true);
	});

	it("flattens content block regions for semantic text selectors", async () => {
		const blocks: SlideBlock[] = [
			{ type: "paragraph", region: "main", text: "Opening paragraph" },
			{ type: "bullets", region: "main", items: ["First bullet", "Second bullet"], ordered: false },
			{ type: "quote", region: "main", text: "Quoted text", attribution: "Speaker" },
			{ type: "callout", region: "main", heading: "Callout", text: "Callout detail" },
			{ type: "stats", region: "main", items: [{ value: "42%", label: "Growth" }] },
			{ type: "table", region: "primary", headers: ["Name", "Value"], rows: [["Alpha", "10"]] },
			{
				type: "widget",
				region: "secondary",
				version: 1,
				kind: "flow",
				direction: "horizontal",
				nodes: [
					{
						id: "node-1",
						label: "Collect",
						description: "",
						value: "",
						role: "start",
						tone: "neutral",
						parentId: "",
					},
				],
				edges: [],
			},
			{ type: "image", region: "media", url: "image.png", alt: "", caption: "Media caption" },
		];
		const regionalManifest: OoxmlTemplateManifest = {
			layouts: {
				body: {
					sourceSlideNumber: 2,
					textSlots: {
						body: { shapeId: 21, value: "slide.body" },
						primary: { shapeId: 22, value: "slide.primary" },
						secondary: { shapeId: 23, value: "slide.secondary" },
						media: { shapeId: 24, value: "slide.mediaCaption" },
					},
				},
			},
		};
		const slide = contentSlide("body", "Regions", "Flattened");
		slide.blocks = blocks;
		const output = await renderOoxmlTemplate(
			await tinyTemplate(),
			regionalManifest,
			presentation([slide]),
		);
		const zip = await JSZip.loadAsync(output);
		const clonedSlide = parse(await zipText(zip, "ppt/slides/slide8.xml"));
		const textByShapeId = new Map(
			elements(clonedSlide, PRESENTATION, "sp").map((shape) => [
				elements(shape, PRESENTATION, "cNvPr")[0]?.getAttribute("id"),
				elements(shape, DRAWING, "p")
					.map((paragraph) =>
						elements(paragraph, DRAWING, "t")
							.map((text) => text.textContent)
							.join(""),
					)
					.join("\n"),
			]),
		);

		expect(textByShapeId.get("21")).toBe(
			"Opening paragraph\nFirst bullet\nSecond bullet\nQuoted text\nSpeaker\nCallout\nCallout detail\n42% Growth",
		);
		expect(textByShapeId.get("22")).toBe("Name\tValue\nAlpha\t10");
		expect(textByShapeId.get("23")).toBe("Collect");
		expect(textByShapeId.get("24")).toBe("Media caption");
		const bodyShape = elements(clonedSlide, PRESENTATION, "sp").find(
			(shape) => elements(shape, PRESENTATION, "cNvPr")[0]?.getAttribute("id") === "21",
		);
		if (!bodyShape) throw new Error("Expected generated body shape");
		const paragraphs = elements(bodyShape, DRAWING, "p");
		expect(paragraphs).toHaveLength(8);
		expect(
			paragraphs.map((paragraph) =>
				elements(paragraph, DRAWING, "t")
					.map((text) => text.textContent)
					.join(""),
			),
		).toEqual([
			"Opening paragraph",
			"First bullet",
			"Second bullet",
			"Quoted text",
			"Speaker",
			"Callout",
			"Callout detail",
			"42% Growth",
		]);
	});

	it("keeps every internal cloned relationship target resolvable", async () => {
		const template = await tinyTemplate();
		const output = await renderOoxmlTemplate(
			template,
			manifest,
			presentation([contentSlide("cover", "Integrity", "Checked")]),
		);
		const zip = await JSZip.loadAsync(output);
		const rels = parse(await zipText(zip, "ppt/slides/_rels/slide8.xml.rels"));
		for (const relationship of elements(rels, RELATIONSHIPS, "Relationship")) {
			const target = relationship.getAttribute("Target");
			if (!target) {
				throw new Error("Fixture relationship is missing Target");
			}
			const resolved = new URL(
				target,
				"https://package.invalid/ppt/slides/slide8.xml",
			).pathname.slice(1);
			expect(zip.file(resolved), `${target} should resolve to ${resolved}`).not.toBeNull();
		}
	});

	it("rejects a mapped text selector that is absent from the source slide", async () => {
		const template = await tinyTemplate();
		const invalidManifest: OoxmlTemplateManifest = {
			layouts: {
				cover: {
					sourceSlideNumber: 1,
					textSlots: { title: { shapeId: 999, value: "slide.title" } },
				},
			},
		};

		expect(
			renderOoxmlTemplate(
				template,
				invalidManifest,
				presentation([contentSlide("cover", "Missing", "Selector")]),
			),
		).rejects.toThrow('slot "cover.title" expected one p:cNvPr with id 999, found 0');
	});

	it("rejects missing layouts and missing source relationship parts", async () => {
		const template = await tinyTemplate();
		expect(
			renderOoxmlTemplate(
				template,
				{ layouts: {} },
				presentation([contentSlide("cover", "A", "B")]),
			),
		).rejects.toThrow('manifest has no layout "cover"');

		const broken = await JSZip.loadAsync(template);
		broken.remove("ppt/slides/_rels/slide7.xml.rels");
		const brokenBytes = await broken.generateAsync({ type: "uint8array" });
		expect(
			renderOoxmlTemplate(brokenBytes, manifest, presentation([contentSlide("cover", "A", "B")])),
		).rejects.toThrow("missing relationships for source slide 1 part");
	});

	it("rejects duplicate and malformed content type overrides", async () => {
		const template = await tinyTemplate();
		const duplicate = await JSZip.loadAsync(template);
		const contentTypes = await zipText(duplicate, "[Content_Types].xml");
		duplicate.file(
			"[Content_Types].xml",
			contentTypes.replace(
				"</Types>",
				'<Override PartName="/ppt/slides/slide7.xml" ContentType="duplicate"/></Types>',
			),
		);
		expect(
			renderOoxmlTemplate(
				await duplicate.generateAsync({ type: "uint8array" }),
				manifest,
				presentation([contentSlide("cover", "A", "B")]),
			),
		).rejects.toThrow('duplicate content type override for "/ppt/slides/slide7.xml"');

		const malformed = await JSZip.loadAsync(template);
		malformed.file(
			"[Content_Types].xml",
			contentTypes.replace('PartName="/ppt/slides/slide7.xml"', 'PartName="ppt/slides/slide7.xml"'),
		);
		expect(
			renderOoxmlTemplate(
				await malformed.generateAsync({ type: "uint8array" }),
				manifest,
				presentation([contentSlide("cover", "A", "B")]),
			),
		).rejects.toThrow('malformed content type override "ppt/slides/slide7.xml"');
	});
});
