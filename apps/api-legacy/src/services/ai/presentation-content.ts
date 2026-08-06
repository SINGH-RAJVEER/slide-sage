import type {
	BackgroundFocalPoint,
	BackgroundOverlay,
	BlockEmphasis,
	BlockTreatment,
	ChartConfig,
	ContentSlide,
	SlideBlock,
	SlideDensity,
	SlideLayout,
	SlidePattern,
	SlideRegion,
	SlideTone,
	StructuredSlide,
	WidgetDirection,
	WidgetKind,
	WidgetNodeRole,
	WidgetTone,
} from "@slidesage/types";
import {
	BACKGROUND_FOCAL_POINTS,
	BACKGROUND_OVERLAYS,
	BLOCK_EMPHASES,
	BLOCK_TREATMENTS,
	MAX_WIDGET_EDGES,
	MAX_WIDGET_NODES,
	SLIDE_DENSITIES,
	SLIDE_LAYOUTS,
	SLIDE_PATTERNS,
	SLIDE_TONES,
} from "@slidesage/types";
import { JSONRecoveryError, recoverJson } from "../../utils/json-recovery";

interface RawPresentation extends Record<string, unknown> {
	slides?: unknown;
	title?: unknown;
}

const SLIDE_LAYOUT_SET = new Set<SlideLayout>(SLIDE_LAYOUTS);
const LEGACY_LAYOUTS: Record<string, SlideLayout> = {
	title: "cover",
	content: "body",
	"two-column": "split",
	"image-right": "media-right",
};
const SLIDE_TONE_SET = new Set<SlideTone>(SLIDE_TONES);
const SLIDE_DENSITY_SET = new Set<SlideDensity>(SLIDE_DENSITIES);
const SLIDE_PATTERN_SET = new Set<SlidePattern>(SLIDE_PATTERNS);
const BACKGROUND_FOCAL_POINT_SET = new Set<BackgroundFocalPoint>(BACKGROUND_FOCAL_POINTS);
const BACKGROUND_OVERLAY_SET = new Set<BackgroundOverlay>(BACKGROUND_OVERLAYS);
const BLOCK_EMPHASIS_SET = new Set<BlockEmphasis>(BLOCK_EMPHASES);
const BLOCK_TREATMENT_SET = new Set<BlockTreatment>(BLOCK_TREATMENTS);
const CHART_TYPES = new Set<ChartConfig["type"]>([
	"bar",
	"line",
	"pie",
	"doughnut",
	"radar",
	"polarArea",
]);
const WIDGET_KINDS = new Set<WidgetKind>(["timeline", "flow", "architecture", "comparison"]);
const WIDGET_NODE_ROLES = new Set<WidgetNodeRole>([
	"default",
	"start",
	"end",
	"decision",
	"actor",
	"system",
	"data",
]);
const WIDGET_TONES = new Set<WidgetTone>(["neutral", "accent", "positive", "warning", "danger"]);
const WIDGET_DIRECTIONS = new Set<WidgetDirection>(["horizontal", "vertical"]);

function text(value: unknown, maximum = 500): string {
	return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function widgetText(value: unknown, maximum: number): string {
	const valueText = text(value, maximum);
	return /<\/?[a-z][^>]*>|https?:\/\/|www\.|```|javascript:|data:image\/svg/i.test(valueText)
		? ""
		: valueText;
}

function widgetNodeId(value: unknown): string {
	const id = text(value, 80);
	return /^[a-z0-9][a-z0-9_-]*$/i.test(id) ? id : "";
}

function stringArray(value: unknown, maximumItems: number, maximumLength = 300): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.slice(0, maximumItems)
		.map((item) => text(item, maximumLength))
		.filter(Boolean);
}

function normalizeLayout(value: unknown): SlideLayout {
	if (typeof value !== "string") return "body";
	return (
		LEGACY_LAYOUTS[value] ||
		(SLIDE_LAYOUT_SET.has(value as SlideLayout) ? (value as SlideLayout) : "body")
	);
}

function normalizeRegion(value: unknown, layout: SlideLayout, rawLayout: unknown): SlideRegion {
	if (value === "left") return "primary";
	if (value === "right") return rawLayout === "image-right" ? "media" : "secondary";
	if (value === "main" || value === "primary" || value === "secondary" || value === "media") {
		if (value === "main" && (layout === "split" || layout === "comparison")) return "primary";
		return value;
	}
	return "main";
}

function normalizeImageUrl(value: unknown): string {
	const candidate = text(value, 2048);
	if (!candidate) return "";

	try {
		const url = new URL(candidate);
		return url.protocol === "https:" ? url.toString() : "";
	} catch {
		return "";
	}
}

function normalizeBlock(
	input: unknown,
	layout: SlideLayout,
	rawLayout: unknown
): SlideBlock | null {
	if (!input || typeof input !== "object" || Array.isArray(input)) return null;
	const block = input as Record<string, unknown>;
	const region = normalizeRegion(block["region"], layout, rawLayout);
	const semantics = {
		emphasis: BLOCK_EMPHASIS_SET.has(block["emphasis"] as BlockEmphasis)
			? (block["emphasis"] as BlockEmphasis)
			: ("standard" as const),
		treatment: BLOCK_TREATMENT_SET.has(block["treatment"] as BlockTreatment)
			? (block["treatment"] as BlockTreatment)
			: ("plain" as const),
	};

	switch (block["type"]) {
		case "paragraph": {
			const value = text(block["text"], 700);
			return value ? { type: "paragraph", region, text: value, ...semantics } : null;
		}
		case "bullets": {
			const items = stringArray(block["items"], 6, 180);
			return items.length > 0
				? {
						type: "bullets",
						region,
						items,
						ordered: block["ordered"] === true,
						...semantics,
					}
				: null;
		}
		case "table": {
			const headers = stringArray(block["headers"], 6, 120);
			if (headers.length === 0 || !Array.isArray(block["rows"])) return null;
			const rows = block["rows"]
				.slice(0, 8)
				.filter(Array.isArray)
				.map((row) =>
					row
						.slice(0, headers.length)
						.map((cell) => text(cell, 180))
						.concat(Array(Math.max(0, headers.length - row.length)).fill(""))
				);
			return { type: "table", region, headers, rows, ...semantics };
		}
		case "image": {
			const url = normalizeImageUrl(block["url"]);
			if (!url) return null;
			return {
				type: "image",
				region,
				url,
				alt: text(block["alt"], 240) || "Presentation image",
				caption: text(block["caption"], 300),
				...semantics,
			};
		}
		case "image-placeholder":
			return {
				type: "image-placeholder",
				region,
				alt: text(block["alt"], 240) || "Supporting visual",
				caption: text(block["caption"], 300),
				...semantics,
			};
		case "quote": {
			const value = text(block["text"], 500);
			return value
				? {
						type: "quote",
						region,
						text: value,
						attribution: text(block["attribution"], 200),
						...semantics,
					}
				: null;
		}
		case "callout": {
			const value = text(block["text"], 400);
			return value
				? {
						type: "callout",
						region,
						heading: text(block["heading"], 180),
						text: value,
						...semantics,
					}
				: null;
		}
		case "stats": {
			if (!Array.isArray(block["items"])) return null;
			const items = block["items"]
				.slice(0, 6)
				.filter((item) => item && typeof item === "object" && !Array.isArray(item))
				.map((item) => {
					const record = item as Record<string, unknown>;
					return {
						value: text(record["value"], 80),
						label: text(record["label"], 160),
					};
				})
				.filter((item) => item.value || item.label);
			return items.length > 0 ? { type: "stats", region, items, ...semantics } : null;
		}
		case "widget": {
			if (!WIDGET_KINDS.has(block["kind"] as WidgetKind) || !Array.isArray(block["nodes"])) {
				return null;
			}
			const usedIds = new Set<string>();
			const nodes = block["nodes"]
				.slice(0, MAX_WIDGET_NODES)
				.filter((node) => node && typeof node === "object" && !Array.isArray(node))
				.map((node) => {
					const value = node as Record<string, unknown>;
					const id = widgetNodeId(value["id"]);
					const label = widgetText(value["label"], 160);
					if (!id || !label || usedIds.has(id)) return null;
					usedIds.add(id);
					return {
						id,
						label,
						description: widgetText(value["description"], 400),
						value: widgetText(value["value"], 100),
						role: WIDGET_NODE_ROLES.has(value["role"] as WidgetNodeRole)
							? (value["role"] as WidgetNodeRole)
							: "default",
						tone: WIDGET_TONES.has(value["tone"] as WidgetTone)
							? (value["tone"] as WidgetTone)
							: "neutral",
						parentId: widgetNodeId(value["parentId"]),
					};
				})
				.filter((node): node is NonNullable<typeof node> => node !== null);
			if (nodes.length < 2) return null;
			for (const node of nodes) {
				if (node.parentId === node.id || !usedIds.has(node.parentId)) node.parentId = "";
			}

			const edges = Array.isArray(block["edges"])
				? block["edges"]
						.slice(0, MAX_WIDGET_EDGES)
						.filter((edge) => edge && typeof edge === "object" && !Array.isArray(edge))
						.map((edge) => {
							const value = edge as Record<string, unknown>;
							const from = widgetNodeId(value["from"]);
							const to = widgetNodeId(value["to"]);
							return from && to && from !== to && usedIds.has(from) && usedIds.has(to)
								? { from, to, label: widgetText(value["label"], 160) }
								: null;
						})
						.filter((edge): edge is NonNullable<typeof edge> => edge !== null)
				: [];

			return {
				type: "widget",
				region,
				version: 1,
				kind: block["kind"] as WidgetKind,
				direction: WIDGET_DIRECTIONS.has(block["direction"] as WidgetDirection)
					? (block["direction"] as WidgetDirection)
					: "horizontal",
				nodes,
				edges,
				...semantics,
			};
		}
		default:
			return null;
	}
}

function normalizeRegionLabels(
	value: unknown,
	layout: SlideLayout,
	rawLayout: unknown
): ContentSlide["regionLabels"] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const input = value as Record<string, unknown>;
	const labels: NonNullable<ContentSlide["regionLabels"]> = {};
	for (const rawRegion of ["main", "left", "right", "primary", "secondary", "media"] as const) {
		const label = text(input[rawRegion], 80);
		if (label) labels[normalizeRegion(rawRegion, layout, rawLayout)] = label;
	}
	return Object.keys(labels).length > 0 ? labels : undefined;
}

function normalizeBackgroundImage(value: unknown): ContentSlide["backgroundImage"] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const input = value as Record<string, unknown>;
	const url = normalizeImageUrl(input["url"]);
	if (!url) return undefined;
	return {
		url,
		alt: text(input["alt"], 240) || "Slide background",
		focalPoint: BACKGROUND_FOCAL_POINT_SET.has(input["focalPoint"] as BackgroundFocalPoint)
			? (input["focalPoint"] as BackgroundFocalPoint)
			: "center",
		overlay: BACKGROUND_OVERLAY_SET.has(input["overlay"] as BackgroundOverlay)
			? (input["overlay"] as BackgroundOverlay)
			: "medium",
	};
}

function normalizeChartConfig(value: unknown): ChartConfig | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const raw = value as Record<string, unknown>;
	if (typeof raw["type"] !== "string" || !CHART_TYPES.has(raw["type"] as ChartConfig["type"])) {
		return null;
	}
	if (!raw["data"] || typeof raw["data"] !== "object" || Array.isArray(raw["data"])) {
		return null;
	}

	const rawData = raw["data"] as Record<string, unknown>;
	const labels = stringArray(rawData["labels"], 20, 100);
	if (!Array.isArray(rawData["datasets"])) return null;
	const datasets = rawData["datasets"]
		.slice(0, 6)
		.filter((dataset) => dataset && typeof dataset === "object" && !Array.isArray(dataset))
		.map((dataset) => {
			const record = dataset as Record<string, unknown>;
			const data = Array.isArray(record["data"])
				? record["data"].slice(0, labels.length || 20).map((item) => Number(item) || 0)
				: [];
			const backgroundColor = Array.isArray(record["backgroundColor"])
				? stringArray(record["backgroundColor"], 20, 32)
				: text(record["backgroundColor"], 32) || undefined;
			const borderColor = Array.isArray(record["borderColor"])
				? stringArray(record["borderColor"], 20, 32)
				: text(record["borderColor"], 32) || undefined;
			return {
				label: text(record["label"], 160) || undefined,
				data,
				backgroundColor,
				borderColor,
				borderWidth:
					typeof record["borderWidth"] === "number"
						? Math.max(0, Math.min(record["borderWidth"], 10))
						: undefined,
			};
		})
		.filter((dataset) => dataset.data.length > 0);

	if (labels.length === 0 || datasets.length === 0) return null;
	return {
		type: raw["type"] as ChartConfig["type"],
		title: text(raw["title"], 200),
		description: text(raw["description"], 500),
		data: { labels, datasets },
		options: {},
	};
}

function chartFallback(id: string): ContentSlide {
	return {
		id,
		type: "content",
		layout: "body",
		title: "Data Visualization",
		subtitle: "",
		tone: "default",
		density: "standard",
		pattern: "none",
		blocks: [
			{
				id: `${id}-block-1`,
				type: "paragraph",
				region: "main",
				sourceIds: [],
				text: "Chart data unavailable",
				emphasis: "standard",
				treatment: "plain",
			},
		],
	};
}

export function processSlide(input: unknown, index: number): StructuredSlide | null {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		console.warn(`Invalid slide ${index}, skipping`);
		return null;
	}

	const slide = input as Record<string, unknown>;
	const id = text(slide["id"], 120) || `slide-${index + 1}`;
	const presentationMetadata = {
		transition: { type: "none" as const, durationMs: 0 },
		effects: [],
	};
	if (slide["type"] === "chart") {
		const chartConfig = normalizeChartConfig(slide["chartConfig"]);
		return chartConfig
			? { id, type: "chart", chartConfig, ...presentationMetadata }
			: { ...chartFallback(id), ...presentationMetadata };
	}
	if (slide["type"] !== "content") {
		console.warn(`Slide ${index} has an unsupported type, skipping`);
		return null;
	}

	const rawLayout = slide["layout"];
	const layout = normalizeLayout(rawLayout);
	const blocks = Array.isArray(slide["blocks"])
		? slide["blocks"]
				.slice(0, 8)
				.map((block) => normalizeBlock(block, layout, rawLayout))
				.filter((block): block is SlideBlock => block !== null)
				.map((block, blockIndex) => ({
					...block,
					id: `${id}-block-${blockIndex + 1}`,
					sourceIds: [],
				}))
		: [];
	const title = text(slide["title"], 240) || `Slide ${index + 1}`;
	const eyebrow = text(slide["eyebrow"], 120);
	const regionLabels = normalizeRegionLabels(slide["regionLabels"], layout, rawLayout);
	const backgroundImage = normalizeBackgroundImage(slide["backgroundImage"]);

	return {
		id,
		type: "content",
		layout,
		title,
		subtitle: text(slide["subtitle"], 400),
		...(eyebrow ? { eyebrow } : {}),
		...(regionLabels ? { regionLabels } : {}),
		tone: SLIDE_TONE_SET.has(slide["tone"] as SlideTone) ? (slide["tone"] as SlideTone) : "default",
		density: SLIDE_DENSITY_SET.has(slide["density"] as SlideDensity)
			? (slide["density"] as SlideDensity)
			: "standard",
		pattern: SLIDE_PATTERN_SET.has(slide["pattern"] as SlidePattern)
			? (slide["pattern"] as SlidePattern)
			: "none",
		...(backgroundImage ? { backgroundImage } : {}),
		blocks,
		...presentationMetadata,
	};
}

export function parsePresentationContent(content: string): RawPresentation {
	try {
		return JSON.parse(content) as RawPresentation;
	} catch (jsonError) {
		console.warn("Initial JSON parse failed, attempting recovery...");
		const recoveryResult = recoverJson(content, jsonError as Error);
		if (!recoveryResult.content || typeof recoveryResult.content !== "object") {
			throw new JSONRecoveryError("Recovered response was not a JSON object");
		}
		console.log(`JSON recovery successful using ${recoveryResult.strategy} strategy`);
		return recoveryResult.content as RawPresentation;
	}
}

export function normalizePresentationSlides(
	presentation: RawPresentation,
	expectedSlideCount?: number
): StructuredSlide[] {
	const rawSlides = Array.isArray(presentation.slides) ? presentation.slides : [];
	let slides = rawSlides
		.map((slide, index) => processSlide(slide, index))
		.filter((slide): slide is StructuredSlide => slide !== null);

	if (slides.length === 0) {
		throw new Error("OpenRouter returned no usable slides");
	}
	if (expectedSlideCount !== undefined && slides.length < expectedSlideCount) {
		throw new Error(
			`OpenRouter returned ${slides.length} of ${expectedSlideCount} requested slides`
		);
	}
	if (expectedSlideCount !== undefined && slides.length > expectedSlideCount) {
		console.warn(
			`OpenRouter returned ${slides.length} slides; keeping the requested ${expectedSlideCount}`
		);
		slides = slides.slice(0, expectedSlideCount);
	}

	const usedIds = new Set<string>();
	for (const [index, slide] of slides.entries()) {
		const candidate = String(slide.id || "").trim();
		const fallback = `slide-${index + 1}`;
		let id = candidate && !usedIds.has(candidate) ? candidate : fallback;
		let suffix = 2;
		while (usedIds.has(id)) {
			id = `${fallback}-${suffix}`;
			suffix++;
		}
		slide.id = id;
		usedIds.add(id);
	}

	return slides;
}
