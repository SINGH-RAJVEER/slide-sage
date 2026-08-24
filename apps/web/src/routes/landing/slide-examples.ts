import type { ThemeId } from "@slidesage/types";

/**
 * The static slide examples painted onto the hero's orbiting plates. Each
 * entry is a frozen snapshot of a finished deck slide: its theme, eyebrow,
 * title, subtitle, and the stats or bullet lines that fill the lower half.
 * The plates are painted once at startup and never re-render.
 */
export interface SlideExample {
	id: string;
	themeId: ThemeId;
	eyebrow: string;
	title: string;
	subtitle: string;
	stats?: { value: string; label: string }[];
	lines?: string[];
}

export const SLIDE_EXAMPLES: SlideExample[] = [
	{
		id: "midnight-cover",
		themeId: "modern-dark",
		eyebrow: "Platform // Q3 review",
		title: "Ship the roadmap after dark",
		subtitle: "Q3 platform review for the release team",
		stats: [
			{ value: "1.8s", label: "To first slide" },
			{ value: "12", label: "Visual systems" },
		],
	},
	{
		id: "midnight-plan",
		themeId: "modern-dark",
		eyebrow: "Commitments",
		title: "Three bets carry the quarter",
		subtitle: "What the team is committing to, and what it costs",
		lines: [
			"Streaming generation under two seconds",
			"One visual system across every export",
			"Charts composed from intents",
		],
	},
	{
		id: "neon-cover",
		themeId: "neon-district",
		eyebrow: "After hours // drop 07",
		title: "The city stays awake for this",
		subtitle: "Launch-night plan for the drop everyone circled",
		stats: [
			{ value: "00:00", label: "Doors open" },
			{ value: "12k", label: "Waitlist signed" },
		],
	},
	{
		id: "neon-run",
		themeId: "neon-district",
		eyebrow: "Night plan",
		title: "Run of show for launch night",
		subtitle: "From doors open to the last restock alert",
		lines: [
			"Doors at midnight, teaser on the marquee",
			"Cohort one unboxed live on stream",
			"Restock alerts before the commute",
		],
	},
	{
		id: "terra-cover",
		themeId: "terra-mesa",
		eyebrow: "Studio ledger",
		title: "Let the place tell the story",
		subtitle: "A heritage narrative carried by material and makers",
		stats: [
			{ value: "1921", label: "Studio founded" },
			{ value: "5", label: "Generations firing" },
		],
	},
	{
		id: "terra-kiln",
		themeId: "terra-mesa",
		eyebrow: "Studio ledger",
		title: "The clay decides the calendar",
		subtitle: "How a fourth-generation studio plans its year",
		lines: ["Two firings a year, never three", "The kiln sets the schedule", "The town keeps it"],
	},
	{
		id: "brutal-cover",
		themeId: "concrete-brutal",
		eyebrow: "Ops review // Q2",
		title: "The quarter in plain terms",
		subtitle: "Operations review, no rounding, no footnotes",
		stats: [
			{ value: "98.2%", label: "On-time dispatch" },
			{ value: "3", label: "Lines retooled" },
		],
	},
	{
		id: "brutal-facts",
		themeId: "concrete-brutal",
		eyebrow: "Straight talk",
		title: "What held and what cracked",
		subtitle: "The four numbers the plant is managed by",
		lines: [
			"Dispatch held above target",
			"Clearance below spec at the bearing seat",
			"Fix lands with Rev C",
		],
	},
	{
		id: "marquee-evening",
		themeId: "velvet-marquee",
		eyebrow: "Season programme",
		title: "An evening at the marquee",
		subtitle: "Programming notes for the winter season",
		stats: [
			{ value: "14", label: "Nights staged" },
			{ value: "3", label: "Premieres" },
		],
	},
	{
		id: "bubblegum-metrics",
		themeId: "bubblegum-pop",
		eyebrow: "Growth notes",
		title: "Sweet numbers, sharp story",
		subtitle: "The month in signups, streaks, and shares",
		stats: [
			{ value: "+38%", label: "Signups" },
			{ value: "4.6", label: "Share rate" },
		],
	},
	{
		id: "editorial-argument",
		themeId: "elegant-serif",
		eyebrow: "The argument",
		title: "A case made in three moves",
		subtitle: "Editorial structure for a persuasive deck",
		lines: [
			"Open with the reader's objection",
			"Answer it with evidence",
			"Close on the cost of waiting",
		],
	},
	{
		id: "draft-revision",
		themeId: "draft-board",
		eyebrow: "Sheet 01 / Rev C",
		title: "Every revision leaves a line",
		subtitle: "Spec review for the Mk III assembly",
		lines: ["Confirm tolerances", "Trace the load path", "Sign off Rev C"],
	},
];
