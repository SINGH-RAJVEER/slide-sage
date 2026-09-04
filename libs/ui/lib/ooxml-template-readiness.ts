import {
	BINARY_PPTX_TEMPLATE_CATALOG,
	type PresentationData,
	type SlideBlock,
	type SlideRegion,
} from "@slidesage/types";
import { getOoxmlTemplateManifest } from "./ooxml-template-manifests";
import { OOXML_TEXT_SELECTOR_REGIONS } from "./ooxml-template-renderer";

export interface OoxmlExportReadiness {
	ready: boolean;
	reason?: string;
}

export function getOoxmlExportReadiness(presentation: PresentationData): OoxmlExportReadiness {
	const reference = presentation.template;
	if (!reference) return unavailable("The presentation does not select a PowerPoint template.");
	const template = BINARY_PPTX_TEMPLATE_CATALOG.find(
		(entry) => entry.id === reference.id && entry.version === reference.version,
	);
	if (!template) {
		return unavailable(
			`PowerPoint template "${reference.id}" version ${reference.version} is unknown.`,
		);
	}
	if (template.asset.status !== "available") {
		return unavailable(`PowerPoint template "${template.name}" is pending asset upload.`);
	}
	const manifest = getOoxmlTemplateManifest(template.id);
	if (!manifest) {
		return unavailable(
			`PowerPoint template "${template.name}" has not completed OOXML onboarding.`,
		);
	}
	for (let index = 0; index < presentation.slides.length; index += 1) {
		const slide = presentation.slides[index];
		if (slide?.type !== "content") {
			return unavailable(
				`OOXML template export supports content slides only. Slide ${index + 1} is ${slide?.type ?? "unknown"}.`,
			);
		}
		const layout = manifest.layouts[slide.layout];
		if (!layout) {
			return unavailable(`The selected template does not support layout "${slide.layout}".`);
		}
		if (slide.backgroundImage) {
			return unavailable(
				`Slide ${index + 1} contains a background image that native OOXML export does not support yet.`,
			);
		}
		const unsupported = slide.blocks.find(isUnsupportedNativeBlock);
		if (unsupported) {
			return unavailable(
				`Slide ${index + 1} contains ${unsupported.type} content that native OOXML export does not support yet.`,
			);
		}
		const mappedRegions = new Set(
			Object.values(layout.textSlots ?? {})
				.map((slot) => OOXML_TEXT_SELECTOR_REGIONS[slot.value])
				.filter((region): region is SlideRegion => Boolean(region)),
		);
		const unmappedBlock = slide.blocks.find(
			(block) => hasTextContent(block) && !mappedRegions.has(block.region),
		);
		if (unmappedBlock) {
			return unavailable(
				`Slide ${index + 1} has content in the unmapped "${unmappedBlock.region}" region.`,
			);
		}
	}
	return { ready: true };
}

function unavailable(reason: string): OoxmlExportReadiness {
	return { ready: false, reason };
}

function isUnsupportedNativeBlock(block: SlideBlock): boolean {
	return ["chart", "image", "image-placeholder", "stats", "table", "widget"].includes(block.type);
}

function hasTextContent(block: SlideBlock): boolean {
	switch (block.type) {
		case "paragraph":
			return block.text.trim().length > 0;
		case "bullets":
			return block.items.some((item) => item.trim().length > 0);
		case "quote":
			return Boolean(block.text.trim() || block.attribution.trim());
		case "callout":
			return Boolean(block.heading.trim() || block.text.trim());
		case "image-placeholder":
			return Boolean(block.caption.trim());
		default:
			return true;
	}
}
