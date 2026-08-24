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
 * same pipeline the viewer and the marketplace previews use.
 *
 * The mix is deliberately permutation-driven so the ring shows what decks can
 * be built from: image-plus-text compositions, live animations (charts that
 * draw in, stats that count up) beside prose, generated diagrams beside prose,
 * tables, comparisons, and quotes — across all twelve visual systems. Only
 * one plain heading page remains; every other plate pairs its title with
 * real content.
 */
export interface LandingPlate {
	id: string;
	themeId: ThemeId;
	slide: StructuredSlide;
}

/** Stable Unsplash photo ids — https only, as the renderer requires. */
const PHOTO = {
	circuitBoard: "https://images.unsplash.com/photo-1518770660439-4636190af475",
	cityNight: "https://images.unsplash.com/photo-1519501025264-65ba15a82390",
	concreteArchitecture: "https://images.unsplash.com/photo-1486718448742-163732cd1544",
	libraryShelves: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570",
	artSupplies: "https://images.unsplash.com/photo-1513364776144-60967b0f800f",
	forestCanopy: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e",
	confetti: "https://images.unsplash.com/photo-1513151233558-d860c5398176",
	cinemaSeats: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba",
} as const;

function photo(url: string): string {
	return `${url}?auto=format&fit=crop&w=1200&q=80`;
}

type SlideSpec = Omit<ContentSlide, "id" | "type" | "tone" | "density" | "pattern" | "blocks"> &
	Partial<Pick<ContentSlide, "tone" | "density" | "pattern" | "blocks">>;

function slide(id: string, themeId: ThemeId, content: SlideSpec): LandingPlate {
	const { tone = "default", density = "standard", pattern = "none", blocks = [] } = content;
	return {
		id,
		themeId,
		slide: {
			id: `${id}-slide`,
			type: "content",
			...content,
			tone,
			density,
			pattern,
			blocks,
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
	const composed: ChartSlide = {
		id: `${id}-slide`,
		type: "chart",
		chartConfig: config,
	};
	return { id, themeId, slide: composed };
}

const authored: LandingPlate[] = [
	/* The ring's single plain heading page. */
	slide("midnight-cover", "modern-dark", {
		layout: "cover",
		title: "Ship the roadmap after dark",
		subtitle: "Q3 platform review for the release team",
		eyebrow: "Platform // Q3 review",
		pattern: "grid",
	}),
	slide("modern-signals", "modern-dark", {
		layout: "media-right",
		title: "Signals from the edge fleet",
		subtitle: "What four thousand devices reported this week",
		eyebrow: "Telemetry",
		pattern: "grid",
		blocks: [
			{
				id: "modern-signals-image",
				type: "image",
				region: "media",
				url: photo(PHOTO.circuitBoard),
				alt: "Macro photograph of a circuit board",
				caption: "Edge node, rev D board",
			},
			{
				id: "modern-signals-list",
				type: "bullets",
				region: "primary",
				ordered: true,
				items: [
					"Firmware 4.2 rolled to 90% of the fleet",
					"Packet loss down to 0.3% on the new mesh",
					"Two hardware faults traced, fixes shipped",
				],
			},
			{
				id: "modern-signals-note",
				type: "paragraph",
				region: "secondary",
				text: "Every chart in this deck is drawn from the same telemetry stream the fleet reports into — nothing hand-assembled.",
			},
		],
	}),
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
	slide("neon-street", "neon-district", {
		layout: "cover",
		title: "The city stays awake for this",
		subtitle: "Launch-night plan for the drop everyone circled",
		eyebrow: "After hours // drop 07",
		tone: "inverse",
		backgroundImage: {
			url: photo(PHOTO.cityNight),
			alt: "City street glowing under neon signs at night",
			focalPoint: "center",
			overlay: "medium",
		},
		blocks: [
			{
				id: "neon-street-stats",
				type: "stats",
				region: "main",
				emphasis: "strong",
				items: [
					{ value: "00:00", label: "Doors open" },
					{ value: "12k", label: "Waitlist signed" },
					{ value: "40", label: "Cities streaming" },
				],
			},
		],
	}),
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
	slide("brutal-facts", "concrete-brutal", {
		layout: "spotlight",
		title: "What held and what cracked",
		subtitle: "The four numbers the plant is managed by",
		eyebrow: "Ops review // Q2",
		pattern: "grid",
		blocks: [
			{
				id: "brutal-stats",
				type: "stats",
				region: "primary",
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
	}),
	slide("brutal-versus", "concrete-brutal", {
		layout: "comparison",
		title: "Rebuild the line or retool it",
		subtitle: "The two options, costed without mercy",
		eyebrow: "Straight talk",
		pattern: "grid",
		regionLabels: { primary: "Rebuild", secondary: "Retool" },
		blocks: [
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
	}),
	slide("brutal-forms", "concrete-brutal", {
		layout: "media-right",
		title: "Concrete keeps its promises",
		subtitle: "Site walk, north elevation, week nine",
		eyebrow: "Straight talk",
		pattern: "grid",
		blocks: [
			{
				id: "brutal-forms-image",
				type: "image",
				region: "media",
				url: photo(PHOTO.concreteArchitecture),
				alt: "Concrete building against a clear sky",
				caption: "North face, pour complete",
			},
			{
				id: "brutal-forms-note",
				type: "paragraph",
				region: "primary",
				text: "The pour passed inspection on the first walk. Photographs like this one drop straight from the site camera into the deck.",
			},
			{
				id: "brutal-forms-callout",
				type: "callout",
				region: "secondary",
				heading: "Next visit",
				text: "Glazing follows the scaffold drop in week eleven.",
			},
		],
	}),
	slide("editorial-quote", "elegant-serif", {
		layout: "quote",
		title: "On the reader's objection",
		subtitle: "Notes from the editorial desk",
		eyebrow: "The argument",
		density: "airy",
		blocks: [
			{
				id: "editorial-quote-block",
				type: "quote",
				region: "main",
				text: "The objection you avoid is the argument you lose. Answer it first, and the room leans in.",
				attribution: "The editorial desk",
			},
		],
	}),
	slide("editorial-shelf", "elegant-serif", {
		layout: "media-right",
		title: "A case made in three moves",
		subtitle: "Editorial structure for a persuasive deck",
		eyebrow: "The argument",
		density: "airy",
		blocks: [
			{
				id: "editorial-shelf-image",
				type: "image",
				region: "media",
				url: photo(PHOTO.libraryShelves),
				alt: "Rows of books rising along a library shelf",
				caption: "The reading room, before edits",
			},
			{
				id: "editorial-shelf-quote",
				type: "quote",
				region: "primary",
				text: "Structure is kindness to the reader.",
				attribution: "House style, page one",
			},
			{
				id: "editorial-shelf-note",
				type: "paragraph",
				region: "secondary",
				text: "Open with the claim, hold it with evidence, land on the ask. Every persuasive deck here follows that spine.",
			},
		],
	}),
	slide("editorial-radar", "elegant-serif", {
		layout: "sidebar",
		title: "Five forces, one verdict",
		subtitle: "How the manuscript scores against its rivals",
		eyebrow: "The argument",
		density: "airy",
		blocks: [
			{
				id: "editorial-radar-chart",
				type: "chart",
				region: "primary",
				scale: "inline",
				chartConfig: {
					type: "radar",
					title: "Manuscript scorecard",
					description: "Editorial review, five dimensions",
					data: {
						labels: ["Voice", "Pace", "Proof", "Stakes", "Close"],
						datasets: [
							{
								label: "This draft",
								data: [88, 72, 91, 64, 80],
								borderColor: getTemplate("elegant-serif").visual.chartColors[0],
								backgroundColor: `${getTemplate("elegant-serif").visual.chartColors[0]}33`,
								borderWidth: 2,
							},
							{
								label: "Category median",
								data: [61, 58, 66, 52, 57],
								borderColor: getTemplate("elegant-serif").visual.chartColors[1],
								borderWidth: 1,
							},
						],
					},
				},
			},
			{
				id: "editorial-radar-points",
				type: "bullets",
				region: "secondary",
				ordered: false,
				items: [
					"Proof leads — keep the receipts up front",
					"Stakes lag — sharpen them by chapter three",
				],
			},
		],
	}),
	slide("corporate-numbers", "corporate-blue", {
		layout: "body",
		title: "The quarter in numbers",
		subtitle: "Results against the plan the board approved",
		eyebrow: "Quarterly business review",
		pattern: "dots",
		blocks: [
			{
				id: "corporate-numbers-text",
				type: "paragraph",
				region: "main",
				text: "Revenue landed ahead of plan on flat headcount, while support load fell for the second quarter running. The figures count up as the slide arrives — the story is in their slope, not their size.",
			},
			{
				id: "corporate-numbers-stats",
				type: "stats",
				region: "main",
				emphasis: "hero",
				items: [
					{ value: "112%", label: "Of revenue plan" },
					{ value: "-18%", label: "Support tickets" },
					{ value: "94", label: "Net promoter score" },
				],
			},
		],
	}),
	slide("corporate-rollout", "corporate-blue", {
		layout: "split",
		title: "Rollout on rails",
		subtitle: "Four gates between pilot and every customer",
		eyebrow: "Delivery plan",
		blocks: [
			{
				id: "corporate-rollout-widget",
				type: "widget",
				version: 1,
				kind: "timeline",
				direction: "horizontal",
				region: "primary",
				nodes: [
					{
						id: "gate-pilot",
						label: "Pilot",
						description: "Twelve design partners",
						value: "Wk 1",
						role: "start",
						tone: "accent",
						parentId: "",
					},
					{
						id: "gate-review",
						label: "Security review",
						description: "Pen test and sign-off",
						value: "Wk 4",
						role: "default",
						tone: "neutral",
						parentId: "",
					},
					{
						id: "gate-ga",
						label: "General access",
						description: "Full customer base",
						value: "Wk 9",
						role: "end",
						tone: "positive",
						parentId: "",
					},
				],
				edges: [
					{ from: "gate-pilot", to: "gate-review", label: "" },
					{ from: "gate-review", to: "gate-ga", label: "" },
				],
			},
			{
				id: "corporate-rollout-note",
				type: "paragraph",
				region: "secondary",
				text: "Each gate publishes its own exit criteria. A gate slips only with a written exception — no silent date moves.",
			},
		],
	}),
	slide("studio-flatlay", "creative-studio", {
		layout: "media-left",
		title: "Inside the studio system",
		subtitle: "How a brand book becomes forty layouts",
		eyebrow: "Craft notes",
		density: "airy",
		pattern: "dots",
		blocks: [
			{
				id: "studio-flatlay-image",
				type: "image",
				region: "media",
				url: photo(PHOTO.artSupplies),
				alt: "Flat lay of brushes, paints, and paper on a desk",
				caption: "Studio table, mid-project",
			},
			{
				id: "studio-flatlay-list",
				type: "bullets",
				region: "primary",
				ordered: false,
				items: [
					"One palette per client, locked at kickoff",
					"Type pairings chosen before any layout exists",
					"Every export checked against the grid",
				],
			},
			{
				id: "studio-flatlay-callout",
				type: "callout",
				region: "secondary",
				heading: "House rule",
				text: "If a layout only works at full size, it does not work.",
			},
		],
	}),
	slide("nature-canopy", "nature-green", {
		layout: "media-right",
		title: "The canopy is the ledger",
		subtitle: "What ten years of restoration bought",
		eyebrow: "Field report",
		density: "airy",
		blocks: [
			{
				id: "nature-canopy-image",
				type: "image",
				region: "media",
				url: photo(PHOTO.forestCanopy),
				alt: "Sunlight falling through a green forest canopy",
				caption: "North watershed, spring survey",
			},
			{
				id: "nature-canopy-note",
				type: "paragraph",
				region: "primary",
				text: "Counting trees is the easy part. The canopy's depth tells you whether the forest will still be here in fifty years — and this year it passed every threshold we set.",
			},
			{
				id: "nature-canopy-stats",
				type: "stats",
				region: "secondary",
				items: [
					{ value: "64", label: "Hectares restored" },
					{ value: "212", label: "Native species" },
				],
			},
		],
	}),
	slide("nature-flow", "nature-green", {
		layout: "canvas",
		title: "From seedling to canopy",
		subtitle: "The restoration loop, season by season",
		eyebrow: "Field report",
		density: "airy",
		blocks: [
			{
				id: "nature-flow-widget",
				type: "widget",
				version: 1,
				kind: "flow",
				direction: "horizontal",
				region: "main",
				nodes: [
					{
						id: "flow-collect",
						label: "Collect",
						description: "Seed gathered on site",
						value: "",
						role: "start",
						tone: "neutral",
						parentId: "",
					},
					{
						id: "flow-nurse",
						label: "Nurse",
						description: "Two seasons in the nursery",
						value: "",
						role: "default",
						tone: "neutral",
						parentId: "",
					},
					{
						id: "flow-plant",
						label: "Plant",
						description: "Rain-season planting windows",
						value: "",
						role: "default",
						tone: "accent",
						parentId: "",
					},
					{
						id: "flow-monitor",
						label: "Monitor",
						description: "Survival counted yearly",
						value: "",
						role: "end",
						tone: "positive",
						parentId: "",
					},
				],
				edges: [
					{ from: "flow-collect", to: "flow-nurse", label: "" },
					{ from: "flow-nurse", to: "flow-plant", label: "" },
					{ from: "flow-plant", to: "flow-monitor", label: "feeds next cycle" },
				],
			},
			{
				id: "nature-flow-note",
				type: "paragraph",
				region: "main",
				text: "Nothing leaves the loop. Seed collected from a clearing is nursed, planted, and counted — and the counts choose where the next clearing goes.",
			},
		],
	}),
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
	slide("bubblegum-recap", "bubblegum-pop", {
		layout: "media-left",
		title: "Best season yet, by the numbers",
		subtitle: "The swap club's year-end recap",
		eyebrow: "Season wrap",
		pattern: "diagonal",
		blocks: [
			{
				id: "bubblegum-recap-image",
				type: "image",
				region: "media",
				url: photo(PHOTO.confetti),
				alt: "Colourful confetti scattered across a bright background",
				caption: "Season closer party",
			},
			{
				id: "bubblegum-recap-stats",
				type: "stats",
				region: "primary",
				emphasis: "strong",
				items: [
					{ value: "480", label: "Swaps completed" },
					{ value: "96%", label: "Rated five stars" },
				],
			},
			{
				id: "bubblegum-recap-note",
				type: "paragraph",
				region: "secondary",
				text: "Membership doubled without a single paid ad — every new member arrived dragged by a friend.",
			},
		],
	}),
	slide("velvet-front-row", "velvet-marquee", {
		layout: "media-right",
		title: "Save the front row",
		subtitle: "Season subscriptions open with the house lights",
		eyebrow: "Marquee season",
		tone: "inverse",
		blocks: [
			{
				id: "velvet-front-row-image",
				type: "image",
				region: "media",
				url: photo(PHOTO.cinemaSeats),
				alt: "Red cinema seats in a darkened hall",
				caption: "House seats, curtain up",
			},
			{
				id: "velvet-front-row-quote",
				type: "quote",
				region: "primary",
				text: "A season ticket is a promise you make to your future evenings.",
				attribution: "From last year's curtain speech",
			},
			{
				id: "velvet-front-row-note",
				type: "paragraph",
				region: "secondary",
				text: "Subscribers keep the same seat all season, with exchange privileges the box office honours without a fee.",
			},
		],
	}),
	slide("draft-table", "draft-board", {
		layout: "body",
		title: "Every tolerance on one sheet",
		subtitle: "Spec review for the Mk III assembly",
		eyebrow: "Sheet 01 / Rev C",
		pattern: "grid",
		blocks: [
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
	}),
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
