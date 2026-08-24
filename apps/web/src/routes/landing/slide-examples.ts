import type {
	ChartConfig,
	ChartSlide,
	ContentSlide,
	StructuredSlide,
	ThemeId,
} from "@slidesage/types";
import { MARKETPLACE_ITEMS } from "@slidesage/ui/lib/catalog";
import { getTemplate } from "@slidesage/ui/lib/templates";

/**
 * The plates orbiting the wordmark. Each is a real slide rendered by the
 * production SlideRenderer at 16:9 and scaled down inside its plate — the
 * same pipeline the viewer and the marketplace previews use. The mix spans
 * content, quotes, charts, tables, and comparisons on purpose, so the ring
 * shows the range of slides SlideSage can produce.
 */
export interface LandingPlate {
	id: string;
	themeId: ThemeId;
	slide: StructuredSlide;
}

function coverSlide(
	id: string,
	themeId: ThemeId,
	title: string,
	subtitle: string,
	overrides: Partial<
		Pick<ContentSlide, "eyebrow" | "tone" | "pattern" | "density" | "regionLabels">
	> = {},
): LandingPlate {
	return {
		id,
		themeId,
		slide: {
			id: `${id}-slide`,
			type: "content",
			layout: "cover",
			title,
			subtitle,
			tone: "default",
			density: "standard",
			pattern: "none",
			blocks: [],
			...overrides,
		},
	};
}

function contentSlide(
	id: string,
	themeId: ThemeId,
	title: string,
	subtitle: string,
	layout: ContentSlide["layout"],
	blocks: ContentSlide["blocks"],
	overrides: Partial<
		Pick<ContentSlide, "eyebrow" | "tone" | "pattern" | "density" | "regionLabels">
	> = {},
): LandingPlate {
	return {
		id,
		themeId,
		slide: {
			id: `${id}-slide`,
			type: "content",
			layout,
			title,
			subtitle,
			tone: "default",
			density: "standard",
			pattern: "none",
			blocks,
			...overrides,
		},
	};
}

function chartSlide(
	id: string,
	themeId: ThemeId,
	type: ChartConfig["type"],
	title: string,
	description: string,
	data: ChartConfig["data"],
): LandingPlate {
	const colors = getTemplate(themeId).visual.chartColors;
	const config: ChartConfig = { type, title, description, data };
	if (type === "doughnut" || type === "pie" || type === "polarArea") {
		for (const dataset of config.data.datasets) {
			dataset.backgroundColor = colors.slice(0, dataset.data.length);
			dataset.borderColor = colors.slice(0, dataset.data.length);
		}
	}
	const slide: ChartSlide = {
		id: `${id}-slide`,
		type: "chart",
		chartConfig: config,
	};
	return { id, themeId, slide };
}

const authored: LandingPlate[] = [
	coverSlide(
		"midnight-cover",
		"modern-dark",
		"Ship the roadmap after dark",
		"Q3 platform review for the release team",
		{
			eyebrow: "Platform // Q3 review",
			pattern: "grid",
		},
	),
	contentSlide(
		"midnight-plan",
		"modern-dark",
		"Three bets carry the quarter",
		"What the team is committing to, and what it costs",
		"sidebar",
		[
			{
				id: "midnight-bets",
				type: "bullets",
				region: "primary",
				ordered: true,
				items: [
					"Streaming generation under two seconds",
					"One visual system across every export",
					"Charts composed from intents",
				],
			},
			{
				id: "midnight-stats",
				type: "stats",
				region: "secondary",
				emphasis: "hero",
				items: [
					{ value: "1.8s", label: "To first slide" },
					{ value: "12", label: "Visual systems" },
				],
			},
		],
		{ eyebrow: "Commitments", pattern: "grid" },
	),
	coverSlide(
		"neon-cover",
		"neon-district",
		"The city stays awake for this",
		"Launch-night plan for the drop everyone circled",
		{
			eyebrow: "After hours // drop 07",
			tone: "inverse",
			pattern: "grid",
		},
	),
	contentSlide(
		"neon-run",
		"neon-district",
		"Run of show for launch night",
		"From doors open to the last restock alert",
		"split",
		[
			{
				id: "neon-milestones",
				type: "bullets",
				region: "primary",
				ordered: false,
				items: [
					"Doors at midnight, teaser on the marquee",
					"Cohort one unboxed live on stream",
					"Restock alerts before the commute",
				],
			},
			{
				id: "neon-numbers",
				type: "stats",
				region: "secondary",
				emphasis: "strong",
				items: [
					{ value: "00:00", label: "Doors open" },
					{ value: "12k", label: "Waitlist signed" },
				],
			},
		],
		{ eyebrow: "Night plan", pattern: "diagonal" },
	),
	coverSlide(
		"terra-cover",
		"terra-mesa",
		"Let the place tell the story",
		"A heritage narrative carried by material and makers",
		{
			eyebrow: "Studio ledger",
			density: "airy",
			pattern: "dots",
		},
	),
	contentSlide(
		"terra-kiln",
		"terra-mesa",
		"The clay decides the calendar",
		"How a fourth-generation studio plans its year",
		"quote",
		[
			{
				id: "terra-quote",
				type: "quote",
				region: "primary",
				text: "We do not chase seasons. The kiln sets the schedule and the town keeps it.",
				attribution: "Fourth-generation kiln master",
			},
			{
				id: "terra-evidence",
				type: "stats",
				region: "secondary",
				items: [
					{ value: "1921", label: "Studio founded" },
					{ value: "5", label: "Generations firing" },
				],
			},
		],
		{ eyebrow: "Studio ledger", density: "airy", pattern: "dots" },
	),
	coverSlide(
		"brutal-cover",
		"concrete-brutal",
		"The quarter in plain terms",
		"Operations review, no rounding, no footnotes",
		{
			eyebrow: "Ops review // Q2",
			pattern: "grid",
		},
	),
	contentSlide(
		"brutal-facts",
		"concrete-brutal",
		"What held and what cracked",
		"The four numbers the plant is managed by",
		"spotlight",
		[
			{
				id: "brutal-stats",
				type: "stats",
				region: "main",
				emphasis: "hero",
				items: [
					{ value: "98.2%", label: "On-time dispatch" },
					{ value: "3", label: "Lines retooled" },
				],
			},
			{
				id: "brutal-markup",
				type: "callout",
				region: "secondary",
				heading: "Markup 14",
				text: "Clearance drops below spec at the bearing seat. Fix lands with Rev C.",
			},
		],
		{ eyebrow: "Straight talk", pattern: "grid" },
	),
	coverSlide(
		"editorial-cover",
		"elegant-serif",
		"A case made in three moves",
		"Editorial structure for a persuasive deck",
		{
			eyebrow: "The argument",
			density: "airy",
		},
	),
	chartSlide(
		"midnight-trend",
		"modern-dark",
		"line",
		"Adoption keeps compounding",
		"Decks generated per week since launch",
		{
			labels: ["W1", "W4", "W8", "W12", "W16"],
			datasets: [
				{
					label: "Decks",
					data: [42, 96, 188, 340, 610],
					borderColor: getTemplate("modern-dark").visual.chartColors[0],
					backgroundColor: `${getTemplate("modern-dark").visual.chartColors[0]}2E`,
					borderWidth: 3,
					fill: true,
				},
			],
		},
	),
	chartSlide(
		"neon-mix",
		"neon-district",
		"doughnut",
		"Where the night crowd came from",
		"Launch traffic by channel",
		{
			labels: ["Stream", "Waitlist", "Resellers"],
			datasets: [{ label: "Share", data: [48, 34, 18] }],
		},
	),
	chartSlide(
		"terra-harvest",
		"terra-mesa",
		"bar",
		"Two firings, four seasons",
		"Pieces out of the kiln by season",
		{
			labels: ["Spring", "Summer", "Autumn", "Winter"],
			datasets: [
				{
					label: "Pieces",
					data: [120, 85, 160, 40],
					backgroundColor: getTemplate("terra-mesa").visual.chartColors[0],
					borderWidth: 0,
				},
			],
		},
	),
	chartSlide(
		"bubblegum-circle",
		"bubblegum-pop",
		"polarArea",
		"What the members came for",
		"Club survey, one pick each",
		{
			labels: ["Events", "Swaps", "Perks", "Community"],
			datasets: [{ label: "Votes", data: [214, 168, 96, 240] }],
		},
	),
	contentSlide(
		"draft-table",
		"draft-board",
		"Every tolerance on one sheet",
		"Spec review for the Mk III assembly",
		"body",
		[
			{
				id: "draft-spec",
				type: "table",
				region: "main",
				headers: ["Check", "Spec", "Measured", "Status"],
				rows: [
					["Bearing seat", "0.02 mm", "0.019 mm", "Pass"],
					["Load path", "12 kN", "12.4 kN", "Pass"],
					["Clearance", "0.05 mm", "0.03 mm", "Rev C"],
				],
			},
		],
		{ eyebrow: "Sheet 01 / Rev C", pattern: "grid" },
	),
	contentSlide(
		"brutal-versus",
		"concrete-brutal",
		"Rebuild the line or retool it",
		"The two options, costed without mercy",
		"comparison",
		[
			{
				id: "brutal-rebuild",
				type: "bullets",
				region: "primary",
				ordered: false,
				items: ["Six weeks of downtime", "Full budget hit up front", "Ten-year runway"],
			},
			{
				id: "brutal-retool",
				type: "bullets",
				region: "secondary",
				ordered: false,
				items: ["Two weekends of work", "A third of the cost", "Five-year runway"],
			},
		],
		{
			eyebrow: "Straight talk",
			pattern: "grid",
			regionLabels: { primary: "Rebuild", secondary: "Retool" },
		},
	),
	contentSlide(
		"editorial-quote",
		"elegant-serif",
		"On the reader's objection",
		"Notes from the editorial desk",
		"quote",
		[
			{
				id: "editorial-quote-block",
				type: "quote",
				region: "primary",
				text: "The objection you avoid is the argument you lose. Answer it first, and the room leans in.",
				attribution: "The editorial desk",
			},
		],
		{ eyebrow: "The argument", density: "airy" },
	),
];

const marketplace: LandingPlate[] = MARKETPLACE_ITEMS.map((item) => ({
	id: `market-${item.id}`,
	themeId: item.themeId,
	slide: item.previewSlide,
}));

/* Round-robin the plates by theme so two slides from the same visual system
   never sit side by side on the ring. */
function interleaveByTheme(plates: LandingPlate[]): LandingPlate[] {
	const groups = new Map<ThemeId, LandingPlate[]>();
	for (const plate of plates) {
		const group = groups.get(plate.themeId);
		if (group) group.push(plate);
		else groups.set(plate.themeId, [plate]);
	}
	const queues = [...groups.values()];
	const ordered: LandingPlate[] = [];
	while (queues.some((queue) => queue.length > 0)) {
		for (let i = 0; i < queues.length; i++) {
			const plate = queues[i]?.shift();
			if (plate) ordered.push(plate);
		}
	}
	return ordered;
}

export const LANDING_PLATES: LandingPlate[] = interleaveByTheme([...authored, ...marketplace]);
