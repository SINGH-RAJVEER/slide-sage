import type { PresentationData, Slide, SlideBlock, SlideRegion } from "@slidesage/types";
import { DOMParser as OoxmlDomParser, XMLSerializer as OoxmlXmlSerializer } from "@xmldom/xmldom";
import JSZip from "jszip";

const CONTENT_TYPES_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/content-types";
const DOCUMENT_RELATIONSHIPS_NAMESPACE =
	"http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIPS_NAMESPACE =
	"http://schemas.openxmlformats.org/package/2006/relationships";
const PRESENTATION_NAMESPACE = "http://schemas.openxmlformats.org/presentationml/2006/main";
const DRAWING_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/main";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";

const OFFICE_DOCUMENT_RELATIONSHIP = "/officeDocument";
const SLIDE_RELATIONSHIP = "/slide";
const NOTES_SLIDE_RELATIONSHIP = "/notesSlide";

export type OoxmlTextValueSelector =
	| "empty"
	| "presentation.title"
	| "slide.title"
	| "slide.subtitle"
	| "slide.eyebrow"
	| "slide.body"
	| "slide.primary"
	| "slide.secondary"
	| "slide.mediaCaption"
	| "slide.chartTitle"
	| "slide.chartDescription";

export interface OoxmlTextSlot {
	shapeId: number;
	value: OoxmlTextValueSelector;
}

export interface OoxmlTemplateLayout {
	sourceSlideNumber: number;
	textSlots?: Record<string, OoxmlTextSlot>;
}

export interface OoxmlTemplateManifest {
	layouts: Record<string, OoxmlTemplateLayout>;
}

interface OrderedSlide {
	partPath: string;
	relationshipId: string;
	relationshipType: string;
}

interface XmlPart {
	document: Document;
	path: string;
}

/**
 * Renders PresentationData into cloned slides from an OOXML template.
 * Layout keys are content slide layouts, "chart", or a scene slide strategy.
 */
export async function renderOoxmlTemplate(
	template: ArrayBuffer | Uint8Array,
	manifest: OoxmlTemplateManifest,
	presentation: PresentationData,
): Promise<Uint8Array> {
	const archive = await loadArchive(template);
	const contentTypes = await readXmlPart(archive, "[Content_Types].xml", "content types");
	assertRoot(contentTypes, "Types", CONTENT_TYPES_NAMESPACE);
	validateContentTypeOverrides(contentTypes.document);

	const rootRelationships = await readXmlPart(archive, "_rels/.rels", "package relationships");
	assertRoot(rootRelationships, "Relationships", PACKAGE_RELATIONSHIPS_NAMESPACE);
	validateInternalRelationships(archive, rootRelationships, "");

	const officeDocumentRelationship = relationships(rootRelationships.document).find(
		(relationship) => relationship.getAttribute("Type")?.endsWith(OFFICE_DOCUMENT_RELATIONSHIP),
	);
	if (!officeDocumentRelationship) {
		throw new Error(
			"Invalid PPTX template: package relationships do not contain an office document",
		);
	}

	const presentationPath = resolveRelationshipTarget(
		"",
		requiredAttribute(officeDocumentRelationship, "Target", "office document relationship"),
	);
	const presentationXml = await readXmlPart(archive, presentationPath, "presentation");
	assertRoot(presentationXml, "presentation", PRESENTATION_NAMESPACE);

	const presentationRelationshipsPath = relationshipPartPath(presentationPath);
	const presentationRelationships = await readXmlPart(
		archive,
		presentationRelationshipsPath,
		"presentation relationships",
	);
	assertRoot(presentationRelationships, "Relationships", PACKAGE_RELATIONSHIPS_NAMESPACE);
	validateInternalRelationships(archive, presentationRelationships, presentationPath);

	const orderedSlides = resolveOrderedSlides(presentationXml, presentationRelationships);
	const layouts = presentation.slides.map((slide, index) => {
		const layoutKey = semanticLayout(slide);
		const layout = manifest.layouts[layoutKey];
		if (!layout) {
			throw new Error(
				`OOXML template manifest has no layout "${layoutKey}" for slide ${index + 1}`,
			);
		}
		if (!Number.isInteger(layout.sourceSlideNumber) || layout.sourceSlideNumber < 1) {
			throw new Error(`OOXML template layout "${layoutKey}" has an invalid source slide number`);
		}
		const source = orderedSlides[layout.sourceSlideNumber - 1];
		if (!source) {
			throw new Error(
				`OOXML template layout "${layoutKey}" references missing source slide ${layout.sourceSlideNumber}`,
			);
		}
		return { layout, layoutKey, source };
	});

	const existingRelationshipIds = relationships(presentationRelationships.document).map(
		(relationship) => requiredAttribute(relationship, "Id", "presentation relationship"),
	);
	let nextRelationshipNumber = nextNumericId(existingRelationshipIds, /^rId(\d+)$/);
	const slideIdList = firstElement(presentationXml.document, PRESENTATION_NAMESPACE, "sldIdLst");
	if (!slideIdList) {
		throw new Error("Invalid PPTX template: presentation is missing p:sldIdLst");
	}
	const existingSlideIds = elements(slideIdList, PRESENTATION_NAMESPACE, "sldId").map((slideId) =>
		parseNumericAttribute(slideId, "id", "presentation slide ID"),
	);
	let nextSlideId = Math.max(255, ...existingSlideIds) + 1;
	let nextSlidePartNumber = nextPartNumber(
		archive,
		contentTypes.document,
		/^ppt\/slides\/slide(\d+)\.xml$/,
		/^\/ppt\/slides\/slide(\d+)\.xml$/,
	);
	let nextNotesPartNumber = nextPartNumber(
		archive,
		contentTypes.document,
		/^ppt\/notesSlides\/notesSlide(\d+)\.xml$/,
		/^\/ppt\/notesSlides\/notesSlide(\d+)\.xml$/,
	);

	for (const slideId of elements(slideIdList, PRESENTATION_NAMESPACE, "sldId")) {
		slideIdList.removeChild(slideId);
	}
	for (const relationship of relationships(presentationRelationships.document)) {
		if (relationship.getAttribute("Type")?.endsWith(SLIDE_RELATIONSHIP)) {
			relationship.parentNode?.removeChild(relationship);
		}
	}

	for (let index = 0; index < presentation.slides.length; index += 1) {
		const slide = presentation.slides[index];
		const requestedLayout = layouts[index];
		if (!slide || !requestedLayout) {
			throw new Error(`Invalid PresentationData: missing slide ${index + 1}`);
		}
		const { layout, layoutKey, source } = requestedLayout;
		const sourceSlideXml = await readXmlPart(
			archive,
			source.partPath,
			`source slide ${layout.sourceSlideNumber}`,
		);
		assertRoot(sourceSlideXml, "sld", PRESENTATION_NAMESPACE);
		replaceTextSlots(sourceSlideXml.document, layout, layoutKey, slide, presentation);

		const sourceRelationshipsPath = relationshipPartPath(source.partPath);
		const sourceRelationships = await requiredFileBytes(
			archive,
			sourceRelationshipsPath,
			`relationships for source slide ${layout.sourceSlideNumber}`,
		);
		const parsedSourceRelationships = parseXml(
			new TextDecoder().decode(sourceRelationships),
			sourceRelationshipsPath,
		);
		assertRoot(parsedSourceRelationships, "Relationships", PACKAGE_RELATIONSHIPS_NAMESPACE);
		validateInternalRelationships(archive, parsedSourceRelationships, source.partPath);

		const clonedSlidePath = `ppt/slides/slide${nextSlidePartNumber}.xml`;
		const notesRelationships = relationships(parsedSourceRelationships).filter((relationship) =>
			relationship.getAttribute("Type")?.endsWith(NOTES_SLIDE_RELATIONSHIP),
		);
		if (notesRelationships.length > 1) {
			throw new Error(
				`Invalid PPTX template: source slide ${layout.sourceSlideNumber} has multiple notes slide relationships`,
			);
		}
		const notesRelationship = notesRelationships[0];
		if (notesRelationship) {
			const sourceNotesPath = resolveRelationshipTarget(
				source.partPath,
				requiredAttribute(notesRelationship, "Target", "notes slide relationship"),
			);
			const clonedNotesPath = `ppt/notesSlides/notesSlide${nextNotesPartNumber}.xml`;
			await cloneNotesSlide(
				archive,
				contentTypes.document,
				sourceNotesPath,
				clonedNotesPath,
				clonedSlidePath,
			);
			notesRelationship.setAttribute("Target", relativePartPath(clonedSlidePath, clonedNotesPath));
			nextNotesPartNumber += 1;
		}
		const clonedRelationshipsPath = relationshipPartPath(clonedSlidePath);
		archive.file(clonedSlidePath, serializeXml(sourceSlideXml.document));
		archive.file(
			clonedRelationshipsPath,
			cloneRelationshipsForOwner(parsedSourceRelationships, source.partPath, clonedSlidePath),
		);
		cloneContentTypeOverride(contentTypes.document, source.partPath, clonedSlidePath);

		const relationshipId = `rId${nextRelationshipNumber}`;
		const relationship = presentationRelationships.document.createElementNS(
			PACKAGE_RELATIONSHIPS_NAMESPACE,
			"Relationship",
		);
		relationship.setAttribute("Id", relationshipId);
		relationship.setAttribute("Type", source.relationshipType);
		relationship.setAttribute("Target", relativePartPath(presentationPath, clonedSlidePath));
		presentationRelationships.document.documentElement.appendChild(relationship);

		const slideId = presentationXml.document.createElementNS(PRESENTATION_NAMESPACE, "p:sldId");
		slideId.setAttribute("id", String(nextSlideId));
		slideId.setAttributeNS(DOCUMENT_RELATIONSHIPS_NAMESPACE, "r:id", relationshipId);
		slideIdList.appendChild(slideId);

		nextRelationshipNumber += 1;
		nextSlideId += 1;
		nextSlidePartNumber += 1;
	}

	archive.file(contentTypes.path, serializeXml(contentTypes.document));
	archive.file(presentationXml.path, serializeXml(presentationXml.document));
	archive.file(presentationRelationships.path, serializeXml(presentationRelationships.document));

	return archive.generateAsync({ type: "uint8array" });
}

async function loadArchive(template: ArrayBuffer | Uint8Array): Promise<JSZip> {
	try {
		return await JSZip.loadAsync(template);
	} catch (error) {
		throw new Error("Invalid PPTX template: unable to read ZIP package", { cause: error });
	}
}

async function readXmlPart(archive: JSZip, path: string, label: string): Promise<XmlPart> {
	const file = archive.file(path);
	if (!file) {
		throw new Error(`Invalid PPTX template: missing ${label} part "${path}"`);
	}
	return { document: parseXml(await file.async("string"), path), path };
}

async function requiredFileBytes(archive: JSZip, path: string, label: string): Promise<Uint8Array> {
	const file = archive.file(path);
	if (!file) {
		throw new Error(`Invalid PPTX template: missing ${label} part "${path}"`);
	}
	return file.async("uint8array");
}

function parseXml(xml: string, path: string): Document {
	const document = new OoxmlDomParser().parseFromString(
		xml,
		"application/xml",
	) as unknown as Document;
	if (document.getElementsByTagName("parsererror").length > 0) {
		throw new Error(`Invalid PPTX template: malformed XML in "${path}"`);
	}
	return document;
}

function serializeXml(document: Document): string {
	return new OoxmlXmlSerializer().serializeToString(document);
}

function assertRoot(part: XmlPart | Document, localName: string, namespace: string): void {
	const document = "document" in part ? part.document : part;
	const path = "path" in part ? part.path : "XML part";
	if (
		document.documentElement.localName !== localName ||
		document.documentElement.namespaceURI !== namespace
	) {
		throw new Error(`Invalid PPTX template: unexpected root element in "${path}"`);
	}
}

function relationships(document: Document): Element[] {
	return elements(document.documentElement, PACKAGE_RELATIONSHIPS_NAMESPACE, "Relationship");
}

function resolveOrderedSlides(
	presentation: XmlPart,
	presentationRelationships: XmlPart,
): OrderedSlide[] {
	const relationshipById = new Map(
		relationships(presentationRelationships.document).map((relationship) => [
			requiredAttribute(relationship, "Id", "presentation relationship"),
			relationship,
		]),
	);
	const slideIdList = firstElement(presentation.document, PRESENTATION_NAMESPACE, "sldIdLst");
	if (!slideIdList) {
		throw new Error("Invalid PPTX template: presentation is missing p:sldIdLst");
	}

	return elements(slideIdList, PRESENTATION_NAMESPACE, "sldId").map((slideId, index) => {
		const relationshipId =
			slideId.getAttributeNS(DOCUMENT_RELATIONSHIPS_NAMESPACE, "id") ??
			slideId.getAttribute("r:id");
		if (!relationshipId) {
			throw new Error(`Invalid PPTX template: slide ${index + 1} has no relationship ID`);
		}
		const relationship = relationshipById.get(relationshipId);
		if (!relationship?.getAttribute("Type")?.endsWith(SLIDE_RELATIONSHIP)) {
			throw new Error(
				`Invalid PPTX template: slide ${index + 1} references missing slide relationship "${relationshipId}"`,
			);
		}
		return {
			partPath: resolveRelationshipTarget(
				presentation.path,
				requiredAttribute(relationship, "Target", `relationship "${relationshipId}"`),
			),
			relationshipId,
			relationshipType: requiredAttribute(relationship, "Type", `relationship "${relationshipId}"`),
		};
	});
}

function validateInternalRelationships(
	archive: JSZip,
	part: XmlPart | Document,
	ownerPath: string,
): void {
	const document = "document" in part ? part.document : part;
	for (const relationship of relationships(document)) {
		if (relationship.getAttribute("TargetMode") === "External") {
			continue;
		}
		const id = requiredAttribute(relationship, "Id", "relationship");
		const target = resolveRelationshipTarget(
			ownerPath,
			requiredAttribute(relationship, "Target", `relationship "${id}"`),
		);
		if (!archive.file(target)) {
			throw new Error(
				`Invalid PPTX template: relationship "${id}" from "${ownerPath || "/"}" targets missing part "${target}"`,
			);
		}
	}
}

async function cloneNotesSlide(
	archive: JSZip,
	contentTypes: Document,
	sourceNotesPath: string,
	clonedNotesPath: string,
	clonedSlidePath: string,
): Promise<void> {
	const sourceNotes = await readXmlPart(archive, sourceNotesPath, "notes slide");
	assertRoot(sourceNotes, "notes", PRESENTATION_NAMESPACE);
	archive.file(clonedNotesPath, serializeXml(sourceNotes.document));
	cloneContentTypeOverride(contentTypes, sourceNotesPath, clonedNotesPath);

	const sourceRelationshipsPath = relationshipPartPath(sourceNotesPath);
	const sourceRelationshipsFile = archive.file(sourceRelationshipsPath);
	if (!sourceRelationshipsFile) {
		return;
	}
	const sourceRelationships = parseXml(
		await sourceRelationshipsFile.async("string"),
		sourceRelationshipsPath,
	);
	assertRoot(sourceRelationships, "Relationships", PACKAGE_RELATIONSHIPS_NAMESPACE);
	validateInternalRelationships(archive, sourceRelationships, sourceNotesPath);
	for (const relationship of relationships(sourceRelationships)) {
		if (relationship.getAttribute("Type")?.endsWith(SLIDE_RELATIONSHIP)) {
			relationship.setAttribute("Target", relativePartPath(clonedNotesPath, clonedSlidePath));
		}
	}
	archive.file(
		relationshipPartPath(clonedNotesPath),
		cloneRelationshipsForOwner(sourceRelationships, sourceNotesPath, clonedNotesPath),
	);
}

function cloneRelationshipsForOwner(
	document: Document,
	sourceOwnerPath: string,
	clonedOwnerPath: string,
): string {
	for (const relationship of relationships(document)) {
		if (relationship.getAttribute("TargetMode") === "External") {
			continue;
		}
		const relationshipType = relationship.getAttribute("Type");
		if (
			relationshipType?.endsWith(SLIDE_RELATIONSHIP) ||
			relationshipType?.endsWith(NOTES_SLIDE_RELATIONSHIP)
		) {
			continue;
		}
		const target = requiredAttribute(relationship, "Target", "slide relationship");
		const suffixIndex = target.search(/[?#]/);
		const suffix = suffixIndex >= 0 ? target.slice(suffixIndex) : "";
		const resolvedTarget = resolveRelationshipTarget(sourceOwnerPath, target);
		relationship.setAttribute(
			"Target",
			`${relativePartPath(clonedOwnerPath, resolvedTarget)}${suffix}`,
		);
	}
	return serializeXml(document);
}

function replaceTextSlots(
	document: Document,
	layout: OoxmlTemplateLayout,
	layoutKey: string,
	slide: Slide,
	presentation: PresentationData,
): void {
	for (const [slotName, slot] of Object.entries(layout.textSlots ?? {})) {
		if (!Number.isInteger(slot.shapeId) || slot.shapeId < 1) {
			throw new Error(`OOXML template slot "${layoutKey}.${slotName}" has an invalid shape ID`);
		}
		const matches = elements(document, PRESENTATION_NAMESPACE, "cNvPr").filter(
			(element) => element.getAttribute("id") === String(slot.shapeId),
		);
		if (matches.length !== 1) {
			throw new Error(
				`OOXML template slot "${layoutKey}.${slotName}" expected one p:cNvPr with id ${slot.shapeId}, found ${matches.length}`,
			);
		}
		const matchedShapeProperty = matches[0];
		if (!matchedShapeProperty) {
			throw new Error(`OOXML template slot "${layoutKey}.${slotName}" has no matching shape`);
		}
		const shape = closestPresentationShape(matchedShapeProperty);
		const textNodes = shape ? elements(shape, DRAWING_NAMESPACE, "t") : [];
		if (!shape || textNodes.length === 0) {
			throw new Error(
				`OOXML template slot "${layoutKey}.${slotName}" selects shape ${slot.shapeId}, which has no text`,
			);
		}
		const value = textValue(slot.value, slide, presentation, layoutKey, slotName);
		const firstTextNode = textNodes[0];
		if (!firstTextNode) {
			throw new Error(`OOXML template slot "${layoutKey}.${slotName}" has no text node`);
		}
		firstTextNode.textContent = value;
		if (/^\s|\s$/.test(value)) {
			firstTextNode.setAttributeNS(XML_NAMESPACE, "xml:space", "preserve");
		}
		for (const textNode of textNodes.slice(1)) {
			textNode.textContent = "";
		}
	}
}

function closestPresentationShape(element: Element): Element | null {
	let current: Element | null = element;
	while (current) {
		if (current.namespaceURI === PRESENTATION_NAMESPACE && current.localName === "sp") {
			return current;
		}
		const parentNode: Node | null = current.parentNode;
		current = parentNode?.nodeType === 1 ? (parentNode as Element) : null;
	}
	return null;
}

function textValue(
	selector: OoxmlTextValueSelector,
	slide: Slide,
	presentation: PresentationData,
	layoutKey: string,
	slotName: string,
): string {
	if (selector === "empty") {
		return "";
	}
	if (selector === "presentation.title") {
		return presentation.title;
	}
	if (selector === "slide.chartTitle" || selector === "slide.chartDescription") {
		if (slide.type !== "chart") {
			throw new Error(`OOXML template slot "${layoutKey}.${slotName}" cannot read ${selector}`);
		}
		return selector === "slide.chartTitle"
			? (slide.chartConfig.title ?? "")
			: (slide.chartConfig.description ?? "");
	}
	if (slide.type !== "content") {
		throw new Error(`OOXML template slot "${layoutKey}.${slotName}" cannot read ${selector}`);
	}
	if (selector === "slide.title") {
		return slide.title;
	}
	if (selector === "slide.subtitle") {
		return slide.subtitle;
	}
	const selectorRegions: Partial<Record<OoxmlTextValueSelector, SlideRegion>> = {
		"slide.body": "main",
		"slide.primary": "primary",
		"slide.secondary": "secondary",
		"slide.mediaCaption": "media",
	};
	const region = selectorRegions[selector];
	if (region) {
		return flattenRegionBlocks(slide.blocks, region);
	}
	return slide.eyebrow ?? "";
}

function flattenRegionBlocks(blocks: SlideBlock[], region: SlideRegion): string {
	return blocks
		.filter((block) => block.region === region)
		.flatMap((block) => flattenBlock(block))
		.filter((line) => line.length > 0)
		.join("\n");
}

function flattenBlock(block: SlideBlock): string[] {
	switch (block.type) {
		case "paragraph":
			return [block.text];
		case "bullets":
			return block.items;
		case "quote":
			return [block.text, block.attribution];
		case "callout":
			return [block.heading, block.text];
		case "stats":
			return block.items.map((item) => `${item.value} ${item.label}`.trim());
		case "table":
			return [block.headers.join("\t"), ...block.rows.map((row) => row.join("\t"))];
		case "image":
		case "image-placeholder":
			return [block.caption];
		case "widget":
			return block.nodes.map((node) => node.label);
		case "chart":
			return [block.chartConfig.title ?? "", block.chartConfig.description ?? ""];
	}
}

function semanticLayout(slide: Slide): string {
	if (slide.type === "content") {
		return slide.layout;
	}
	if (slide.type === "chart") {
		return "chart";
	}
	return slide.strategy ?? "scene";
}

function validateContentTypeOverrides(document: Document): void {
	const seenPartNames = new Set<string>();
	for (const override of elements(document, CONTENT_TYPES_NAMESPACE, "Override")) {
		const partName = requiredAttribute(override, "PartName", "content type override");
		requiredAttribute(override, "ContentType", `content type override for "${partName}"`);
		if (
			!partName.startsWith("/") ||
			partName.includes("\\") ||
			partName.split("/").includes("..")
		) {
			throw new Error(`Invalid PPTX template: malformed content type override "${partName}"`);
		}
		if (seenPartNames.has(partName)) {
			throw new Error(`Invalid PPTX template: duplicate content type override for "${partName}"`);
		}
		seenPartNames.add(partName);
	}
}

function cloneContentTypeOverride(
	document: Document,
	sourcePath: string,
	clonedPath: string,
): void {
	const sourcePartName = `/${sourcePath}`;
	const sourceOverride = elements(document, CONTENT_TYPES_NAMESPACE, "Override").find(
		(override) => override.getAttribute("PartName") === sourcePartName,
	);
	if (!sourceOverride) {
		throw new Error(`Invalid PPTX template: missing content type override for "${sourcePartName}"`);
	}
	const clonedPartName = `/${clonedPath}`;
	if (
		elements(document, CONTENT_TYPES_NAMESPACE, "Override").some(
			(override) => override.getAttribute("PartName") === clonedPartName,
		)
	) {
		throw new Error(
			`Invalid PPTX template: content type override already exists for "${clonedPartName}"`,
		);
	}
	const override = document.createElementNS(CONTENT_TYPES_NAMESPACE, "Override");
	override.setAttribute("PartName", clonedPartName);
	override.setAttribute(
		"ContentType",
		requiredAttribute(sourceOverride, "ContentType", `content type for "${sourcePartName}"`),
	);
	document.documentElement.appendChild(override);
}

function nextPartNumber(
	archive: JSZip,
	contentTypes: Document,
	filePattern: RegExp,
	overridePattern: RegExp,
): number {
	let maximum = 0;
	for (const path of Object.keys(archive.files)) {
		const match = filePattern.exec(path);
		if (match) {
			maximum = Math.max(maximum, Number(match[1]));
		}
	}
	for (const override of elements(contentTypes, CONTENT_TYPES_NAMESPACE, "Override")) {
		const match = overridePattern.exec(
			requiredAttribute(override, "PartName", "content type override"),
		);
		if (match) {
			maximum = Math.max(maximum, Number(match[1]));
		}
	}
	return maximum + 1;
}

function nextNumericId(ids: string[], pattern: RegExp): number {
	let maximum = 0;
	for (const id of ids) {
		const match = pattern.exec(id);
		if (match) {
			maximum = Math.max(maximum, Number(match[1]));
		}
	}
	return maximum + 1;
}

function requiredAttribute(element: Element, name: string, label: string): string {
	const value = element.getAttribute(name);
	if (!value) {
		throw new Error(`Invalid PPTX template: ${label} is missing ${name}`);
	}
	return value;
}

function parseNumericAttribute(element: Element, name: string, label: string): number {
	const value = Number(requiredAttribute(element, name, label));
	if (!Number.isSafeInteger(value)) {
		throw new Error(`Invalid PPTX template: ${label} is not a valid integer`);
	}
	return value;
}

function firstElement(
	root: Document | Element,
	namespace: string,
	localName: string,
): Element | null {
	return elements(root, namespace, localName)[0] ?? null;
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

function relationshipPartPath(partPath: string): string {
	const slash = partPath.lastIndexOf("/");
	const directory = slash >= 0 ? partPath.slice(0, slash + 1) : "";
	const filename = partPath.slice(slash + 1);
	return `${directory}_rels/${filename}.rels`;
}

function resolveRelationshipTarget(ownerPath: string, target: string): string {
	const cleanTarget = target.split(/[?#]/, 1)[0] ?? "";
	const ownerDirectory = ownerPath.includes("/")
		? ownerPath.slice(0, ownerPath.lastIndexOf("/") + 1)
		: "";
	const combined = cleanTarget.startsWith("/")
		? cleanTarget.slice(1)
		: ownerDirectory + cleanTarget;
	const parts: string[] = [];
	for (const part of combined.split("/")) {
		if (!part || part === ".") {
			continue;
		}
		if (part === "..") {
			if (parts.length === 0) {
				throw new Error(
					`Invalid PPTX template: relationship target escapes the package: "${target}"`,
				);
			}
			parts.pop();
		} else {
			parts.push(part);
		}
	}
	try {
		return decodeURI(parts.join("/"));
	} catch {
		throw new Error(`Invalid PPTX template: relationship target is not a valid URI: "${target}"`);
	}
}

function relativePartPath(ownerPath: string, targetPath: string): string {
	const from = ownerPath.split("/").slice(0, -1);
	const to = targetPath.split("/");
	while (from.length > 0 && to.length > 0 && from[0] === to[0]) {
		from.shift();
		to.shift();
	}
	return [...from.map(() => ".."), ...to].join("/");
}
