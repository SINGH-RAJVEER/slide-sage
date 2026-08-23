import type {
	ChartSlide,
	ContentSlide,
	PresentationData,
	Slide,
	SlideLayout,
	ThemeId,
} from "@slidesage/types";
import { getTemplate } from "./templates";

export interface MarketplaceItem {
	id: string;
	name: string;
	description: string;
	author: string;
	authorInitials: string;
	votes: number;
	uses: string;
	tags: string[];
	featured?: boolean;
	isNew?: boolean;
	themeId: ThemeId;
	layoutId: SlideLayout;
	previewSlide: ContentSlide;
}

function previewSlide(
	id: string,
	title: string,
	subtitle: string,
	layout: SlideLayout,
	blocks: ContentSlide["blocks"],
	overrides: Partial<
		Pick<ContentSlide, "density" | "eyebrow" | "pattern" | "regionLabels" | "tone">
	> = {},
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
		...overrides,
	};
}

export const MARKETPLACE_ITEMS: MarketplaceItem[] = [
	{
		id: "citrus-brief",
		name: "Citrus Brief",
		description: "SlideSage's high-voltage poster system for campaigns, workshops, and launches.",
		author: "SlideSage",
		authorInitials: "SS",
		votes: 389,
		uses: "1.2k",
		tags: ["Bright", "Campaign", "Workshop"],
		featured: true,
		isNew: true,
		themeId: "creative-studio",
		layoutId: "split",
		previewSlide: previewSlide(
			"market-citrus",
			"Momentum has a color",
			"Turn the next quarter into a visible movement",
			"split",
			[
				{
					id: "market-citrus-left",
					type: "callout",
					region: "primary",
					heading: "Make it tangible",
					text: "One message. Three decisive actions.",
				},
				{
					id: "market-citrus-right",
					type: "stats",
					region: "secondary",
					items: [{ value: "86%", label: "Team alignment" }],
				},
			],
			{ eyebrow: "SlideSage original", pattern: "diagonal" },
		),
	},
	{
		id: "paper-grid",
		name: "Paper Grid",
		description: "SlideSage's quiet monochrome system for plans, teaching, and complex work.",
		author: "SlideSage",
		authorInitials: "SS",
		votes: 326,
		uses: "980",
		tags: ["Minimal", "Planning", "Education"],
		featured: true,
		isNew: true,
		themeId: "minimalist",
		layoutId: "body",
		previewSlide: previewSlide(
			"market-paper-grid",
			"Structure creates speed",
			"A practical operating system for complex work",
			"body",
			[
				{
					id: "market-paper-grid-list",
					type: "bullets",
					region: "main",
					ordered: true,
					items: ["Define the constraint", "Name the owner", "Measure the outcome"],
				},
			],
			{ eyebrow: "SlideSage original", density: "airy", pattern: "grid" },
		),
	},
	{
		id: "midnight-signal",
		name: "Midnight Signal",
		description: "SlideSage's cinematic dark system for technical launches and product proof.",
		author: "SlideSage",
		authorInitials: "SS",
		votes: 842,
		uses: "3.4k",
		tags: ["Dark", "Product", "Launch"],
		featured: true,
		themeId: "modern-dark",
		layoutId: "spotlight",
		previewSlide: previewSlide(
			"market-midnight",
			"Signals over noise",
			"The product brief, distilled",
			"spotlight",
			[
				{
					id: "market-midnight-stats",
					type: "stats",
					region: "main",
					items: [
						{ label: "Activation", value: "+42%" },
						{ label: "Time saved", value: "18h" },
					],
				},
			],
			{ eyebrow: "Build 01", tone: "inverse", pattern: "grid" },
		),
	},
	{
		id: "field-notes",
		name: "Field Notes",
		description: "SlideSage's grounded field-report system for impact, research, and communities.",
		author: "SlideSage",
		authorInitials: "SS",
		votes: 614,
		uses: "2.1k",
		tags: ["Editorial", "Research", "Warm"],
		featured: true,
		themeId: "nature-green",
		layoutId: "split",
		previewSlide: previewSlide(
			"market-field",
			"Regrowth is measurable",
			"A field report from the northern corridor",
			"split",
			[
				{
					id: "market-field-callout",
					type: "callout",
					heading: "Measured recovery",
					text: "64 hectares restored",
					region: "primary",
				},
				{
					id: "market-field-copy",
					type: "paragraph",
					text: "Local stewardship changed the curve in under twelve months.",
					region: "secondary",
				},
			],
			{ eyebrow: "Field report", density: "airy", pattern: "dots" },
		),
	},
	{
		id: "founder-letter",
		name: "Founder Letter",
		description:
			"SlideSage's warm editorial system for strategy, annual reviews, and investor letters.",
		author: "SlideSage",
		authorInitials: "SS",
		votes: 497,
		uses: "1.8k",
		tags: ["Serif", "Strategy", "Elegant"],
		themeId: "elegant-serif",
		layoutId: "quote",
		previewSlide: previewSlide(
			"market-founder",
			"Conviction compounds",
			"Letter to our partners",
			"quote",
			[
				{
					id: "market-founder-quote",
					type: "quote",
					region: "main",
					text: "Build the company you would want to discover ten years from now.",
					attribution: "2026 outlook",
				},
			],
			{ eyebrow: "A note from the founder", density: "airy" },
		),
	},
	{
		id: "boardroom-clear",
		name: "Boardroom Clear",
		description:
			"SlideSage's structured data system for executive decisions and operating reviews.",
		author: "SlideSage",
		authorInitials: "SS",
		votes: 731,
		uses: "4.7k",
		tags: ["Business", "Data", "Clean"],
		themeId: "corporate-blue",
		layoutId: "body",
		previewSlide: previewSlide(
			"market-boardroom",
			"The decision in one page",
			"Three indicators point in the same direction",
			"body",
			[
				{
					id: "market-boardroom-list",
					type: "bullets",
					region: "main",
					ordered: false,
					items: ["Demand is durable", "Margins are expanding", "Execution risk is contained"],
				},
			],
			{ eyebrow: "Executive brief", pattern: "grid" },
		),
	},
];

function createPreviewStory(item: MarketplaceItem): ContentSlide {
	switch (item.id) {
		case "citrus-brief":
			return previewSlide(
				`${item.id}-preview-story`,
				"Turn the plan into a moment",
				"A campaign structure built for participation, not passive attention",
				"comparison",
				[
					{
						id: `${item.id}-before`,
						type: "callout",
						region: "primary",
						heading: "Before launch",
						text: "A clear promise, a recognizable visual, and one action worth taking.",
						treatment: "accent",
					},
					{
						id: `${item.id}-during`,
						type: "bullets",
						region: "secondary",
						ordered: true,
						items: ["Reveal the signal", "Invite a response", "Repeat the proof"],
					},
				],
				{ eyebrow: "Campaign rhythm", pattern: "diagonal" },
			);
		case "paper-grid":
			return previewSlide(
				`${item.id}-preview-story`,
				"Make the operating rhythm visible",
				"A spare system that gives each owner and decision its place",
				"sidebar",
				[
					{
						id: `${item.id}-sequence`,
						type: "bullets",
						region: "primary",
						ordered: true,
						items: ["Frame the question", "Name the decision", "Close the loop"],
					},
					{
						id: `${item.id}-rule`,
						type: "callout",
						region: "secondary",
						heading: "Working rule",
						text: "If it cannot fit on one page, it is not ready to decide.",
					},
				],
				{ eyebrow: "Operating system", density: "airy", pattern: "grid" },
			);
		case "midnight-signal":
			return previewSlide(
				`${item.id}-preview-story`,
				"The signal is already in the system",
				"A technical story built from one observable change and its proof",
				"spotlight",
				[
					{
						id: `${item.id}-proof`,
						type: "stats",
						region: "primary",
						emphasis: "hero",
						items: [
							{ value: "99.98%", label: "Pipeline availability" },
							{ value: "43 ms", label: "Median response" },
						],
					},
					{
						id: `${item.id}-readout`,
						type: "paragraph",
						region: "secondary",
						text: "The technical narrative stays focused: show the system, show the signal, show what changes next.",
						emphasis: "supporting",
					},
				],
				{ eyebrow: "Telemetry / 2026.08", tone: "inverse", pattern: "grid" },
			);
		case "field-notes":
			return previewSlide(
				`${item.id}-preview-story`,
				"Listen before you measure",
				"A human-scale report makes room for evidence, place, and progress",
				"split",
				[
					{
						id: `${item.id}-finding`,
						type: "quote",
						region: "primary",
						text: "The restoration plan became real when the community could see itself in it.",
						attribution: "Community workshop participant",
					},
					{
						id: `${item.id}-evidence`,
						type: "stats",
						region: "secondary",
						items: [
							{ value: "18", label: "Local partners" },
							{ value: "64 ha", label: "Restored habitat" },
						],
					},
				],
				{ eyebrow: "Community-led evidence", density: "airy", pattern: "dots" },
			);
		case "founder-letter":
			return previewSlide(
				`${item.id}-preview-story`,
				"A decision deserves a point of view",
				"Long-form conviction, shaped into a deck that still reads with calm authority",
				"quote",
				[
					{
						id: `${item.id}-conviction`,
						type: "quote",
						region: "main",
						text: "The best strategy is legible enough to guide a thousand small decisions.",
						attribution: "SlideSage editorial principle",
					},
				],
				{ eyebrow: "Editorial principle", density: "airy" },
			);
		default:
			return previewSlide(
				`${item.id}-preview-story`,
				"Make the decision trail explicit",
				"A board-ready structure separates signals, risk, and the next move",
				"sidebar",
				[
					{
						id: `${item.id}-signals`,
						type: "stats",
						region: "primary",
						items: [
							{ value: "+18%", label: "Qualified demand" },
							{ value: "3.2x", label: "Coverage ratio" },
						],
					},
					{
						id: `${item.id}-decision`,
						type: "callout",
						region: "secondary",
						heading: "Decision requested",
						text: "Fund the expansion milestone while holding the risk gate through Q3.",
						treatment: "accent",
					},
				],
				{ eyebrow: "Decision brief", pattern: "grid" },
			);
	}
}

export function createMarketplacePreviewPresentation(item: MarketplaceItem): PresentationData {
	const theme = getTemplate(item.themeId).visual;
	const chartSlides: ChartSlide[] = [
		{
			id: `${item.id}-preview-growth-chart`,
			type: "chart",
			chartConfig: {
				type: "line",
				title: "Momentum compounds across the year",
				description: "A representative trend view using the selected theme.",
				data: {
					labels: ["Q1", "Q2", "Q3", "Q4"],
					datasets: [
						{
							label: "Adoption",
							data: [24, 41, 67, 89],
							borderColor: theme.chartColors[0],
							backgroundColor: `${theme.chartColors[0]}2E`,
							borderWidth: 3,
							fill: true,
						},
					],
				},
			},
		},
		{
			id: `${item.id}-preview-mix-chart`,
			type: "chart",
			chartConfig: {
				type: "doughnut",
				title: "A balanced communication mix",
				description: "Charts inherit the preview theme's surrounding visual system.",
				data: {
					labels: ["Narrative", "Evidence", "Action"],
					datasets: [
						{
							data: [42, 34, 24],
							backgroundColor: theme.chartColors.slice(0, 3),
							borderColor: theme.chartColors.slice(0, 3),
							borderWidth: 2,
						},
					],
				},
			},
		},
	];
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
		createPreviewStory(item),
		...chartSlides,
		{
			id: `${item.id}-preview-impact`,
			type: "content",
			layout: "spotlight",
			title: "Designed to make the point land",
			subtitle: "A sample data story",
			tone: "accent",
			density: "standard",
			pattern: "none",
			blocks: [
				{
					id: `${item.id}-preview-stats`,
					type: "stats",
					region: "primary",
					emphasis: "hero",
					items: [
						{ value: "3.4x", label: "Faster comprehension" },
						{ value: "72%", label: "Stronger recall" },
						{ value: "1", label: "Cohesive system" },
					],
				},
			],
		},
		{
			id: `${item.id}-preview-close`,
			type: "content",
			layout: "quote",
			title: "Make the story unmistakable",
			subtitle: item.name,
			tone: "default",
			density: "airy",
			pattern: "none",
			blocks: [
				{
					id: `${item.id}-preview-quote`,
					type: "quote",
					region: "main",
					text: "A strong theme should guide the audience, not compete for attention.",
					attribution: item.author,
				},
			],
		},
	];

	return {
		title: `${item.name} theme preview`,
		theme: item.themeId,
		dimensions: { width: 1280, height: 720 },
		slides,
		totalSlides: slides.length,
	};
}
