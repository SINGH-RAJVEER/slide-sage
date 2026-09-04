export type BinaryTemplateAvailability = "default" | "marketplace";

export type BinaryTemplateAssetStatus = "pending-upload" | "available";

export interface BinaryTemplateAspectRatio {
	width: number;
	height: number;
	label: "16:9" | "A-series portrait";
}

export interface BinaryTemplateDimensions {
	widthEmu: number;
	heightEmu: number;
	aspectRatio: BinaryTemplateAspectRatio;
}

export interface PresentationTemplateReference {
	id: string;
	version: number;
}

export interface BinaryTemplateSelection extends PresentationTemplateReference {
	previewThemeId: import("./index").ThemeId;
}

export interface BinaryPptxTemplate {
	id: string;
	name: string;
	version: 1;
	availability: BinaryTemplateAvailability;
	previewThemeId: import("./index").ThemeId;
	sourceFilename: string;
	dimensions: BinaryTemplateDimensions;
	asset: {
		status: BinaryTemplateAssetStatus;
		path: string;
		sha256?: string;
	};
}

const WIDESCREEN: BinaryTemplateDimensions = {
	widthEmu: 18_288_000,
	heightEmu: 10_287_000,
	aspectRatio: { width: 16, height: 9, label: "16:9" },
};

const HALF_SCALE_WIDESCREEN: BinaryTemplateDimensions = {
	widthEmu: 9_144_000,
	heightEmu: 5_143_500,
	aspectRatio: { width: 16, height: 9, label: "16:9" },
};

type CatalogEntry = Omit<BinaryPptxTemplate, "asset" | "sourceFilename" | "version"> & {
	assetStatus?: BinaryTemplateAssetStatus;
};

function template(entry: CatalogEntry): BinaryPptxTemplate {
	const { assetStatus = "pending-upload", ...metadata } = entry;
	return {
		...metadata,
		version: 1,
		sourceFilename: `${entry.id}.pptx`,
		asset: {
			status: assetStatus,
			path: `pptx-templates/v1/${entry.id}.pptx`,
		},
	};
}

export const BINARY_PPTX_TEMPLATE_CATALOG = [
	template({
		id: "5s-training",
		name: "5S Training",
		availability: "default",
		previewThemeId: "corporate-blue",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "modern-minimal-grid-financial-management",
		name: "Modern Minimal Grid Financial Management",
		availability: "default",
		previewThemeId: "modern-dark",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "minimalist-marketing-annual-report",
		name: "Minimalist Marketing Annual Report",
		availability: "default",
		previewThemeId: "minimalist",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "festive-pattern-travel-agency-business-plan",
		name: "Festive Pattern Travel Agency Business Plan",
		availability: "marketplace",
		previewThemeId: "creative-studio",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "renaissance-odyssey-language-arts",
		name: "Renaissance Odyssey Language Arts",
		availability: "marketplace",
		previewThemeId: "elegant-serif",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "textured-scrapbook-go-green",
		name: "Textured Scrapbook Go Green",
		availability: "marketplace",
		previewThemeId: "nature-green",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "geometric-mathematics-lesson",
		name: "Geometric Mathematics Lesson",
		availability: "marketplace",
		previewThemeId: "draft-board",
		dimensions: HALF_SCALE_WIDESCREEN,
	}),
	template({
		id: "charli-xcx-brat-album-inspired",
		name: "Charli XCX Brat Album-Inspired",
		availability: "marketplace",
		previewThemeId: "neon-district",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "saving-and-investment",
		name: "Difference Between Saving and Investment",
		availability: "marketplace",
		previewThemeId: "corporate-blue",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "email-marketing-workflow",
		name: "Email Marketing Workflow",
		availability: "marketplace",
		previewThemeId: "creative-studio",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "middle-school-functions-lesson",
		name: "Functions Lesson for Middle School",
		availability: "marketplace",
		previewThemeId: "draft-board",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "grade-1-addition",
		name: "Grade 1 Addition",
		availability: "marketplace",
		previewThemeId: "bubblegum-pop",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "minimal-elegant-branding-kit",
		name: "Minimal Elegant Branding Kit",
		availability: "marketplace",
		previewThemeId: "terra-mesa",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "fun-doodles-welcome-to-math-class",
		name: "Fun Doodles Welcome to Math Class",
		availability: "marketplace",
		previewThemeId: "nature-green",
		dimensions: HALF_SCALE_WIDESCREEN,
	}),
	template({
		id: "mid-autumn-moon-festival",
		name: "Mid-Autumn Moon Festival",
		availability: "marketplace",
		previewThemeId: "velvet-marquee",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "geometric-aesthetic-social-media-planner",
		name: "Geometric Aesthetic Social Media Planner",
		availability: "marketplace",
		previewThemeId: "minimalist",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "illustrative-tv-series-social-media",
		name: "Illustrative TV Series Social Media",
		availability: "marketplace",
		previewThemeId: "creative-studio",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "new-jeans-y2k-style",
		name: "New Jeans Y2K Style",
		availability: "marketplace",
		previewThemeId: "bubblegum-pop",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "illustrative-mathematics-quiz",
		name: "Illustrative Mathematics Quiz",
		availability: "marketplace",
		previewThemeId: "creative-studio",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "pastel-street-maps-minitheme",
		name: "Pastel Street Maps Minitheme",
		availability: "marketplace",
		previewThemeId: "terra-mesa",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "pink-doodles-math-online-class",
		name: "Pink Doodles Math Online Class",
		availability: "marketplace",
		previewThemeId: "bubblegum-pop",
		dimensions: HALF_SCALE_WIDESCREEN,
	}),
	template({
		id: "hotel-sales-strategy",
		name: "Hotel Sales Strategy",
		availability: "marketplace",
		previewThemeId: "elegant-serif",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "simple-business-proposal",
		name: "Simple Business Proposal",
		availability: "default",
		assetStatus: "available",
		previewThemeId: "corporate-blue",
		dimensions: HALF_SCALE_WIDESCREEN,
	}),
	template({
		id: "illustrative-design-inspiration",
		name: "Illustrative Design Inspiration",
		availability: "marketplace",
		previewThemeId: "creative-studio",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "simple-performance-review",
		name: "Simple Performance Review",
		availability: "default",
		previewThemeId: "corporate-blue",
		dimensions: HALF_SCALE_WIDESCREEN,
	}),
	template({
		id: "soft-skills-training",
		name: "Soft Skills Training",
		availability: "default",
		previewThemeId: "terra-mesa",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "stock-management-system-project-proposal",
		name: "Stock Management System Project Proposal",
		availability: "marketplace",
		previewThemeId: "draft-board",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "stocks-trading-business-plan",
		name: "Stocks Trading Business Plan",
		availability: "marketplace",
		previewThemeId: "modern-dark",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "strategic-media-planning",
		name: "Strategic Media Planning",
		availability: "marketplace",
		previewThemeId: "corporate-blue",
		dimensions: WIDESCREEN,
	}),
	template({
		id: "my-travel-wrapped",
		name: "My Travel Wrapped",
		availability: "marketplace",
		previewThemeId: "neon-district",
		dimensions: WIDESCREEN,
	}),
] as const satisfies readonly BinaryPptxTemplate[];

function requiredCatalogEntry(id: string): BinaryPptxTemplate {
	const entry = BINARY_PPTX_TEMPLATE_CATALOG.find((candidate) => candidate.id === id);
	if (!entry) throw new Error(`Binary PowerPoint template is missing from the catalog: ${id}`);
	return entry;
}

export const DEFAULT_BINARY_PPTX_TEMPLATE = requiredCatalogEntry("simple-business-proposal");

export function buildBinaryTemplateUrl(
	publicBaseUrl: string,
	templateEntry: Pick<BinaryPptxTemplate, "asset">,
): string {
	const baseUrl = publicBaseUrl.endsWith("/") ? publicBaseUrl : `${publicBaseUrl}/`;
	const encodedPath = templateEntry.asset.path.split("/").map(encodeURIComponent).join("/");
	return new URL(encodedPath, baseUrl).toString();
}
