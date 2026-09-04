import {
	BINARY_PPTX_TEMPLATE_CATALOG,
	type BinaryPptxTemplate,
	type PresentationTemplateReference,
} from "@slidesage/types";

export interface MarketplaceItem {
	id: string;
	name: string;
	description: string;
	tags: string[];
	templateReference: PresentationTemplateReference;
	sourceFilename: string;
	aspectRatio: BinaryPptxTemplate["dimensions"]["aspectRatio"];
	dimensions: BinaryPptxTemplate["dimensions"];
	/** Object path of the cover thumbnail rendered from the package itself. */
	thumbnailPath: string;
	available: boolean;
}

function marketplaceTags(entry: BinaryPptxTemplate): string[] {
	return [
		...entry.name.toLowerCase().split(/[^a-z0-9]+/),
		"pptx",
		"powerpoint",
		entry.dimensions.aspectRatio.label.toLowerCase(),
	].filter((tag, index, tags) => tag.length > 1 && tags.indexOf(tag) === index);
}

export function marketplaceItem(entry: BinaryPptxTemplate): MarketplaceItem {
	return {
		id: entry.id,
		name: entry.name,
		description: `${entry.name} is a PowerPoint template in ${entry.dimensions.aspectRatio.label} format.`,
		tags: marketplaceTags(entry),
		templateReference: { id: entry.id, version: entry.version },
		sourceFilename: entry.sourceFilename,
		aspectRatio: entry.dimensions.aspectRatio,
		dimensions: entry.dimensions,
		thumbnailPath: entry.thumbnailPath,
		available: entry.asset.status === "available",
	};
}

export const MARKETPLACE_ITEMS: MarketplaceItem[] = BINARY_PPTX_TEMPLATE_CATALOG.filter(
	(entry) => entry.availability === "marketplace",
).map(marketplaceItem);
