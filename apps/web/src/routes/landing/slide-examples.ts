import type { ContentSlide, ThemeId } from "@slidesage/types";
import { MARKETPLACE_ITEMS } from "@slidesage/ui/lib/catalog";

/**
 * The plates orbiting the wordmark. Each is a real slide rendered by the
 * production SlideRenderer at 16:9 and scaled down inside its plate — the
 * same pipeline the viewer and the marketplace previews use.
 */
export interface LandingPlate {
	id: string;
	themeId: ThemeId;
	slide: ContentSlide;
}

function coverSlide(
	id: string,
	themeId: ThemeId,
	title: string,
	subtitle: string,
	overrides: Partial<Pick<ContentSlide, "eyebrow" | "tone" | "pattern" | "density">> = {},
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
	overrides: Partial<Pick<ContentSlide, "eyebrow" | "tone" | "pattern" | "density">> = {},
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
