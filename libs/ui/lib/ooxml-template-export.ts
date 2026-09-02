import {
	BINARY_PPTX_TEMPLATE_CATALOG,
	buildBinaryTemplateUrl,
	type PresentationData,
} from "@slidesage/types";
import { getOoxmlTemplateManifest } from "./ooxml-template-manifests";
import { renderOoxmlTemplate } from "./ooxml-template-renderer";

const PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export interface OoxmlTemplateExportOptions {
	publicBaseUrl: string;
	fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export async function buildOoxmlTemplatePptx(
	presentation: PresentationData,
	options: OoxmlTemplateExportOptions,
): Promise<Uint8Array> {
	const reference = presentation.template;
	if (!reference) {
		throw new Error("The presentation does not select a PowerPoint template.");
	}
	const template = BINARY_PPTX_TEMPLATE_CATALOG.find(
		(entry) => entry.id === reference.id && entry.version === reference.version,
	);
	if (!template) {
		throw new Error(
			`PowerPoint template "${reference.id}" version ${reference.version} is unknown.`,
		);
	}
	const manifest = getOoxmlTemplateManifest(template.id);
	if (!manifest) {
		throw new Error(`PowerPoint template "${template.name}" has not completed OOXML onboarding.`);
	}
	const unsupportedSlideIndex = presentation.slides.findIndex((slide) => slide.type !== "content");
	if (unsupportedSlideIndex !== -1) {
		const slide = presentation.slides[unsupportedSlideIndex];
		throw new Error(
			`Unsupported PowerPoint slide kind "${slide?.type ?? "unknown"}" at slide ${unsupportedSlideIndex + 1}. OOXML template export supports content slides only.`,
		);
	}
	const baseUrl = options.publicBaseUrl.trim();
	if (!baseUrl) {
		throw new Error("PowerPoint template storage is not configured.");
	}
	if (template.asset.status !== "available") {
		throw new Error(`PowerPoint template "${template.name}" is pending asset upload.`);
	}
	const response = await (options.fetcher ?? fetch)(buildBinaryTemplateUrl(baseUrl, template));
	if (!response.ok) {
		throw new Error(
			`Unable to download PowerPoint template "${template.name}" (${response.status}).`,
		);
	}
	return renderOoxmlTemplate(await response.arrayBuffer(), manifest, presentation);
}

export async function exportOoxmlTemplatePptx(
	presentation: PresentationData,
	options: OoxmlTemplateExportOptions,
): Promise<void> {
	const output = await buildOoxmlTemplatePptx(presentation, options);
	const bytes = new Uint8Array(output);
	const blob = new Blob([bytes], { type: PPTX_MIME_TYPE });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = safeFileName(presentation.title);
	anchor.click();
	URL.revokeObjectURL(url);
}

function safeFileName(title: string): string {
	const normalized = (title || "Untitled Presentation")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[\\/:*?"<>|]/g, "_")
		.replace(/[. ]+$/g, "")
		.slice(0, 120);
	return `${normalized || "Untitled Presentation"}.pptx`;
}
