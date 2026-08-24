import type { ContentSlide, ThemeId } from "@slidesage/types";

/**
 * The four landing galleries. Each pairs one GalleryHeading canvas variant
 * (its own noise field, typography, and orbit direction) with a SlideSage
 * theme and a two-slide sample deck rendered by the real slide renderer.
 */
export type LandingGalleryVariant =
	| "rising-diagonal"
	| "falling-diagonal"
	| "horizontal-sweep"
	| "vertical-loop";

export interface LandingGallery {
	id: string;
	variant: LandingGalleryVariant;
	themeId: ThemeId;
	themeName: string;
	headline: string;
	description: string;
	slides: [ContentSlide, ContentSlide];
}

function coverSlide(
	id: string,
	title: string,
	subtitle: string,
	overrides: Partial<Pick<ContentSlide, "eyebrow" | "tone" | "pattern" | "density">> = {},
): ContentSlide {
	return {
		id,
		type: "content",
		layout: "cover",
		title,
		subtitle,
		tone: "default",
		density: "standard",
		pattern: "none",
		blocks: [],
		...overrides,
	};
}

function contentSlide(
	id: string,
	title: string,
	subtitle: string,
	layout: ContentSlide["layout"],
	blocks: ContentSlide["blocks"],
	overrides: Partial<Pick<ContentSlide, "eyebrow" | "tone" | "pattern" | "density">> = {},
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

export const LANDING_GALLERIES: LandingGallery[] = [
	{
		id: "midnight-terminal",
		variant: "rising-diagonal",
		themeId: "modern-dark",
		themeName: "Midnight Terminal",
		headline: "Matte plates under a slow rise of noise",
		description:
			"A quiet dark deck for engineering reviews. One accent that glows without shouting.",
		slides: [
			coverSlide(
				"landing-midnight-cover",
				"Ship the roadmap after dark",
				"Q3 platform review for the release team",
				{
					eyebrow: "Platform // Q3 review",
					pattern: "grid",
				},
			),
			contentSlide(
				"landing-midnight-plan",
				"Three bets carry the quarter",
				"What the team is committing to, and what it costs",
				"sidebar",
				[
					{
						id: "landing-midnight-bets",
						type: "bullets",
						region: "primary",
						ordered: true,
						items: [
							"Streaming generation below two seconds to first slide",
							"One visual system applied across every export format",
							"Charts composed from intents, not hand-tuned series",
						],
					},
					{
						id: "landing-midnight-cost",
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
		],
	},
	{
		id: "neon-district",
		variant: "falling-diagonal",
		themeId: "neon-district",
		themeName: "Neon District",
		headline: "Broadcast colour torn into flat blocks",
		description:
			"After-hours synthwave for product drops and launch streams. Built to be read from the back row.",
		slides: [
			coverSlide(
				"landing-neon-cover",
				"The city stays awake for this",
				"Launch-night plan for the drop everyone circled",
				{
					eyebrow: "After hours // drop 07",
					tone: "inverse",
					pattern: "grid",
				},
			),
			contentSlide(
				"landing-neon-run",
				"Run of show for launch night",
				"From doors open to the last restock alert",
				"split",
				[
					{
						id: "landing-neon-milestones",
						type: "bullets",
						region: "primary",
						ordered: false,
						items: [
							"Doors at midnight, teaser loop on the marquee",
							"Cohort one unboxed live on stream",
							"Restock alerts routed before the morning commute",
						],
					},
					{
						id: "landing-neon-numbers",
						type: "stats",
						region: "secondary",
						emphasis: "strong",
						items: [
							{ value: "00:00", label: "Doors open" },
							{ value: "12k", label: "Waitlist signed" },
						],
					},
				],
				{ eyebrow: "Night plan", tone: "default", pattern: "diagonal" },
			),
		],
	},
	{
		id: "terra-mesa",
		variant: "horizontal-sweep",
		themeId: "terra-mesa",
		themeName: "Terra Mesa",
		headline: "Print colours dithered to three tones",
		description:
			"Warm paper, old-style serifs, and an offset plate behind every headline. For heritage brands and slow stories.",
		slides: [
			coverSlide(
				"landing-terra-cover",
				"Let the place tell the story",
				"A heritage narrative carried by material and makers",
				{
					eyebrow: "Studio ledger",
					density: "airy",
					pattern: "dots",
				},
			),
			contentSlide(
				"landing-terra-studio",
				"The clay decides the calendar",
				"How a fourth-generation studio plans its year",
				"quote",
				[
					{
						id: "landing-terra-quote",
						type: "quote",
						region: "primary",
						text: "We do not chase seasons. The kiln sets the schedule and the town keeps it.",
						attribution: "Fourth-generation kiln master",
					},
					{
						id: "landing-terra-evidence",
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
		],
	},
	{
		id: "concrete-brutal",
		variant: "vertical-loop",
		themeId: "concrete-brutal",
		themeName: "Concrete Brutal",
		headline: "One ink on one stock, shaded by dot size",
		description:
			"Safety-orange marks on raw concrete. A quarterly review theme that refuses to soften the numbers.",
		slides: [
			coverSlide(
				"landing-brutal-cover",
				"The quarter in plain terms",
				"Operations review, no rounding, no footnotes",
				{
					eyebrow: "Ops review // Q2",
					pattern: "grid",
				},
			),
			contentSlide(
				"landing-brutal-facts",
				"What held and what cracked",
				"The four numbers the plant is managed by",
				"spotlight",
				[
					{
						id: "landing-brutal-stats",
						type: "stats",
						region: "main",
						emphasis: "hero",
						items: [
							{ value: "98.2%", label: "On-time dispatch" },
							{ value: "3", label: "Lines retooled" },
						],
					},
					{
						id: "landing-brutal-markup",
						type: "callout",
						region: "secondary",
						heading: "Markup 14",
						text: "Clearance drops below spec at the bearing seat. Fix lands with Rev C.",
					},
				],
				{ eyebrow: "Straight talk", pattern: "grid" },
			),
		],
	},
];

export const LANDING_SLIDE_COUNT = LANDING_GALLERIES.reduce(
	(total, gallery) => total + gallery.slides.length,
	0,
);

/** Flat position helpers so the hero variant and the carousel share one index. */
export function galleryAtPosition(position: number): {
	galleryIndex: number;
	slideIndex: number;
} {
	const wrapped = ((position % LANDING_SLIDE_COUNT) + LANDING_SLIDE_COUNT) % LANDING_SLIDE_COUNT;
	let remaining = wrapped;
	for (let galleryIndex = 0; galleryIndex < LANDING_GALLERIES.length; galleryIndex++) {
		const count = LANDING_GALLERIES[galleryIndex]?.slides.length ?? 0;
		if (remaining < count) return { galleryIndex, slideIndex: remaining };
		remaining -= count;
	}
	return { galleryIndex: 0, slideIndex: 0 };
}

export function firstPositionOfGallery(galleryIndex: number): number {
	let position = 0;
	for (let i = 0; i < galleryIndex; i++) {
		position += LANDING_GALLERIES[i]?.slides.length ?? 0;
	}
	return position;
}
