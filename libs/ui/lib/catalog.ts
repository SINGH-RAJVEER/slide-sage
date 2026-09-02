import {
	BINARY_PPTX_TEMPLATE_CATALOG,
	type BinaryPptxTemplate,
	type ContentSlide,
	type PresentationData,
	type PresentationTemplateReference,
	type Slide,
	type SlideLayout,
	type ThemeId,
} from "@slidesage/types";

export interface MarketplaceItem {
	id: string;
	name: string;
	description: string;
	tags: string[];
	previewThemeId: ThemeId;
	templateReference: PresentationTemplateReference;
	sourceFilename: string;
	aspectRatio: BinaryPptxTemplate["dimensions"]["aspectRatio"];
	dimensions: BinaryPptxTemplate["dimensions"];
	layoutId: SlideLayout;
	previewSlide: ContentSlide;
}

function previewSlide(
	id: string,
	title: string,
	subtitle: string,
	layout: SlideLayout,
	blocks: ContentSlide["blocks"],
): ContentSlide {
	return {
		id,
		type: "content",
		layout,
		title,
		subtitle,
		tone: "default",
		density: "standard",
		pattern: "none",
		blocks,
	};
}

function marketplaceTags(entry: BinaryPptxTemplate): string[] {
	return [
		...entry.name.toLowerCase().split(/[^a-z0-9]+/),
		"pptx",
		"powerpoint",
		entry.dimensions.aspectRatio.label.toLowerCase(),
	].filter((tag, index, tags) => tag.length > 1 && tags.indexOf(tag) === index);
}

function marketplaceItem(entry: BinaryPptxTemplate): MarketplaceItem {
	const templateReference = { id: entry.id, version: entry.version };
	const description = `${entry.name} is a binary PowerPoint template in ${entry.dimensions.aspectRatio.label} format.`;
	const preview = previewSlide(
		`${entry.id}-marketplace-preview`,
		entry.name,
		`Binary PPTX template | ${entry.dimensions.aspectRatio.label}`,
		"split",
		[
			{
				id: `${entry.id}-marketplace-format`,
				type: "callout",
				region: "primary",
				heading: "Template format",
				text: `${entry.dimensions.aspectRatio.label} | version ${entry.version}`,
				treatment: "accent",
			},
			{
				id: `${entry.id}-marketplace-reference`,
				type: "paragraph",
				region: "secondary",
				text: `Template reference: ${entry.id}`,
			},
		],
	);

	return {
		id: entry.id,
		name: entry.name,
		description,
		tags: marketplaceTags(entry),
		previewThemeId: entry.previewThemeId,
		templateReference,
		sourceFilename: entry.sourceFilename,
		aspectRatio: entry.dimensions.aspectRatio,
		dimensions: entry.dimensions,
		layoutId: preview.layout,
		previewSlide: preview,
	};
}

export const MARKETPLACE_ITEMS: MarketplaceItem[] = BINARY_PPTX_TEMPLATE_CATALOG.filter(
	(entry) => entry.availability === "marketplace",
).map(marketplaceItem);

export function createMarketplacePreviewPresentation(item: MarketplaceItem): PresentationData {
	const slides: Slide[] = [
		{
			...item.previewSlide,
			id: `${item.id}-preview-title`,
			layout: "cover",
			blocks: [],
		},
		{
			...item.previewSlide,
			id: `${item.id}-preview-showcase`,
		},
		previewSlide(`${item.id}-preview-source`, "Binary template source", item.name, "sidebar", [
			{
				id: `${item.id}-preview-source-file`,
				type: "paragraph",
				region: "primary",
				text: item.sourceFilename,
			},
			{
				id: `${item.id}-preview-version`,
				type: "callout",
				region: "secondary",
				heading: "Installed reference",
				text: `${item.templateReference.id} | version ${item.templateReference.version}`,
			},
		]),
		previewSlide(
			`${item.id}-preview-dimensions`,
			"Presentation dimensions",
			item.aspectRatio.label,
			"spotlight",
			[
				{
					id: `${item.id}-preview-size`,
					type: "stats",
					region: "main",
					emphasis: "hero",
					items: [
						{ value: item.dimensions.widthEmu.toLocaleString("en-US"), label: "Width in EMU" },
						{ value: item.dimensions.heightEmu.toLocaleString("en-US"), label: "Height in EMU" },
					],
				},
			],
		),
	];

	return {
		title: `${item.name} template preview`,
		theme: item.previewThemeId,
		template: item.templateReference,
		dimensions: { width: 1280, height: 720 },
		slides,
		totalSlides: slides.length,
	};
}
