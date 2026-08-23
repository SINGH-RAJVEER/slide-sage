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
		id: "neon-district",
		name: "Neon District",
		description:
			"After-hours synthwave glow built for product drops, night markets, and launch streams.",
		author: "Vera Kato",
		authorInitials: "VK",
		votes: 912,
		uses: "4.1k",
		tags: ["Neon", "Dark", "Launch"],
		featured: true,
		isNew: true,
		themeId: "neon-district",
		layoutId: "spotlight",
		previewSlide: previewSlide(
			"market-neon-district",
			"The city stays awake for this",
			"A midnight launch plan for the drop everyone circled",
			"spotlight",
			[
				{
					id: "market-neon-district-stats",
					type: "stats",
					region: "main",
					emphasis: "hero",
					items: [
						{ value: "00:00", label: "Doors open" },
						{ value: "12k", label: "Waitlist signed" },
					],
				},
			],
			{ eyebrow: "After hours // drop 07", tone: "inverse", pattern: "grid" },
		),
	},
	{
		id: "draft-board",
		name: "Draft Board",
		description:
			"Blueprint linework and orange markups for engineering reviews, specs, and postmortems.",
		author: "Ines Okafor",
		authorInitials: "IO",
		votes: 668,
		uses: "2.7k",
		tags: ["Technical", "Blueprint", "Review"],
		featured: true,
		themeId: "draft-board",
		layoutId: "sidebar",
		previewSlide: previewSlide(
			"market-draft-board",
			"Every revision leaves a line",
			"Spec review for the Mk III assembly",
			"sidebar",
			[
				{
					id: "market-draft-board-list",
					type: "bullets",
					region: "primary",
					ordered: true,
					items: ["Confirm tolerances", "Trace the load path", "Sign off Rev C"],
				},
				{
					id: "market-draft-board-markup",
					type: "callout",
					region: "secondary",
					heading: "Markup 14",
					text: "Clearance drops below spec at the bearing seat.",
				},
			],
			{ eyebrow: "Sheet 01 / Rev C", pattern: "grid" },
		),
	},
	{
		id: "velvet-marquee",
		name: "Velvet Marquee",
		description:
			"Black-tie theater glamour with champagne gold for galas, premieres, and award nights.",
		author: "Maison Lune",
		authorInitials: "ML",
		votes: 845,
		uses: "3.2k",
		tags: ["Gala", "Gold", "Elegant"],
		featured: true,
		themeId: "velvet-marquee",
		layoutId: "quote",
		previewSlide: previewSlide(
			"market-velvet-marquee",
			"Tonight, the house lights fall",
			"Programme for the twelfth annual Lantern Awards",
			"quote",
			[
				{
					id: "market-velvet-marquee-quote",
					type: "quote",
					region: "main",
					text: "An evening is remembered by the moment it made the room hold its breath.",
					attribution: "Programme notes",
				},
			],
			{ eyebrow: "Evening programme", density: "airy" },
		),
	},
	{
		id: "bubblegum-pop",
		name: "Bubblegum Pop",
		description:
			"Y2K candy pastels for community launches, school clubs, and pitches that refuse to be boring.",
		author: "Pip Sundae",
		authorInitials: "PS",
		votes: 574,
		uses: "1.9k",
		tags: ["Pastel", "Playful", "Community"],
		isNew: true,
		themeId: "bubblegum-pop",
		layoutId: "split",
		previewSlide: previewSlide(
			"market-bubblegum-pop",
			"Serious fun only",
			"The membership drive, but make it a party",
			"split",
			[
				{
					id: "market-bubblegum-pop-callout",
					type: "callout",
					region: "primary",
					heading: "Join the club",
					text: "Stickers at the door, mixtape at midnight.",
				},
				{
					id: "market-bubblegum-pop-stats",
					type: "stats",
					region: "secondary",
					items: [{ value: "214", label: "Members and counting" }],
				},
			],
			{ eyebrow: "New drop // spring social", pattern: "dots" },
		),
	},
	{
		id: "concrete-brutal",
		name: "Concrete Brutal",
		description:
			"Raw industrial slabs and safety-orange signage for operational reviews and hard truths.",
		author: "R. Castellanos",
		authorInitials: "RC",
		votes: 723,
		uses: "2.4k",
		tags: ["Industrial", "Bold", "Ops"],
		themeId: "concrete-brutal",
		layoutId: "body",
		previewSlide: previewSlide(
			"market-concrete-brutal",
			"The numbers carry the argument",
			"Quarterly operations review, unpolished",
			"body",
			[
				{
					id: "market-concrete-brutal-list",
					type: "bullets",
					region: "main",
					ordered: false,
					items: [
						"Line 2 missed throughput three weeks running",
						"Hiring pipeline is the constraint, not demand",
						"Maintenance backlog is paid-down by June",
					],
				},
			],
			{ eyebrow: "No polish // Q2 review", pattern: "grid" },
		),
	},
	{
		id: "terra-mesa",
		name: "Terra Mesa",
		description:
			"Sun-baked adobe craft with sienna and turquoise for heritage brands and place-based stories.",
		author: "Ada Reyes",
		authorInitials: "AR",
		votes: 489,
		uses: "1.5k",
		tags: ["Warm", "Heritage", "Craft"],
		themeId: "terra-mesa",
		layoutId: "split",
		previewSlide: previewSlide(
			"market-terra-mesa",
			"Made where the sun settles",
			"A brand story five generations in the making",
			"split",
			[
				{
					id: "market-terra-mesa-callout",
					type: "callout",
					region: "primary",
					heading: "Slow by design",
					text: "Every glaze is mixed the way the studio learned it in 1921.",
				},
				{
					id: "market-terra-mesa-copy",
					type: "paragraph",
					region: "secondary",
					text: "The kilns still fire on the original schedule, and the waitlist proves the patience pays.",
				},
			],
			{ eyebrow: "From the mesa", density: "airy", pattern: "dots" },
		),
	},
];

function createPreviewStory(item: MarketplaceItem): ContentSlide {
	switch (item.id) {
		case "neon-district":
			return previewSlide(
				`${item.id}-preview-story`,
				"Run the night like a set list",
				"A drop sequence paced for a crowd that arrives already loud",
				"comparison",
				[
					{
						id: `${item.id}-doors`,
						type: "callout",
						region: "primary",
						heading: "Before doors",
						text: "Tease the silhouette, seed the countdown, keep the product dark.",
						treatment: "accent",
					},
					{
						id: `${item.id}-midnight`,
						type: "bullets",
						region: "secondary",
						ordered: true,
						items: ["Kill the lights", "Reveal the drop", "Open the queue"],
					},
				],
				{ eyebrow: "Set list", pattern: "diagonal" },
			);
		case "draft-board":
			return previewSlide(
				`${item.id}-preview-story`,
				"Read the drawing before the debate",
				"A review ritual that keeps opinions anchored to linework",
				"spotlight",
				[
					{
						id: `${item.id}-proof`,
						type: "stats",
						region: "primary",
						emphasis: "hero",
						items: [
							{ value: "0.02 mm", label: "Worst-case deviation" },
							{ value: "17", label: "Markups closed" },
						],
					},
					{
						id: `${item.id}-readout`,
						type: "paragraph",
						region: "secondary",
						text: "Each open markup gets an owner, a drawing reference, and a date before anyone leaves the room.",
						emphasis: "supporting",
					},
				],
				{ eyebrow: "Review log / sheet 04", pattern: "grid" },
			);
		case "velvet-marquee":
			return previewSlide(
				`${item.id}-preview-story`,
				"Script the evening like theatre",
				"Three acts, one stage, and no reason to check a phone",
				"quote",
				[
					{
						id: `${item.id}-act`,
						type: "quote",
						region: "main",
						text: "The programme is a promise: nothing on this stage will waste the room's time.",
						attribution: "Director's note",
					},
				],
				{ eyebrow: "Act one", density: "airy" },
			);
		case "bubblegum-pop":
			return previewSlide(
				`${item.id}-preview-story`,
				"Make showing up the easy part",
				"A recruitment arc that treats newcomers like regulars from minute one",
				"split",
				[
					{
						id: `${item.id}-hello`,
						type: "quote",
						region: "primary",
						text: "I came for the stickers and stayed because someone learned my name.",
						attribution: "Member since March",
					},
					{
						id: `${item.id}-numbers`,
						type: "stats",
						region: "secondary",
						items: [
							{ value: "68%", label: "Bring a friend rate" },
							{ value: "9", label: "Events this term" },
						],
					},
				],
				{ eyebrow: "Social proof", density: "airy", pattern: "dots" },
			);
		case "concrete-brutal":
			return previewSlide(
				`${item.id}-preview-story`,
				"Name the bottleneck out loud",
				"An operating review that separates signal, risk, and the next pour",
				"sidebar",
				[
					{
						id: `${item.id}-signals`,
						type: "stats",
						region: "primary",
						items: [
							{ value: "-6%", label: "Throughput vs plan" },
							{ value: "11 d", label: "Maintenance backlog" },
						],
					},
					{
						id: `${item.id}-decision`,
						type: "callout",
						region: "secondary",
						heading: "Decision",
						text: "Pull two floaters to Line 2 and hold the June reset date.",
						treatment: "accent",
					},
				],
				{ eyebrow: "Straight talk", pattern: "grid" },
			);
		default:
			return previewSlide(
				`${item.id}-preview-story`,
				"Let the place tell the story",
				"A heritage narrative carried by material, memory, and makers",
				"split",
				[
					{
						id: `${item.id}-voice`,
						type: "quote",
						region: "primary",
						text: "We do not chase seasons. The clay decides the calendar.",
						attribution: "Fourth-generation kiln master",
					},
					{
						id: `${item.id}-evidence`,
						type: "stats",
						region: "secondary",
						items: [
							{ value: "1921", label: "Studio founded" },
							{ value: "5", label: "Generations firing" },
						],
					},
				],
				{ eyebrow: "Studio ledger", density: "airy", pattern: "dots" },
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
				title: "A representative trend in this theme's voice",
				description: "Charts inherit the preview theme's palette and typography.",
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
				title: "The theme's data palette at work",
				description: "Every slice pulls from the same visual system.",
				data: {
					labels: ["Signal", "Story", "Action"],
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
			title: "Built to leave an impression",
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
