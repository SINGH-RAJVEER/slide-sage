import type { CSSProperties } from "react";

export type ThemeLayoutLanguage =
	| "signal-grid"
	| "midnight-terminal"
	| "paper-grid"
	| "kinetic-blocks"
	| "editorial-ledger"
	| "field-notes"
	| "neon-district"
	| "draft-board"
	| "velvet-marquee"
	| "bubblegum-pop"
	| "concrete-brutal"
	| "terra-mesa";

export interface ThemeVisualSystem {
	background: string;
	foreground: string;
	title: string;
	muted: string;
	accent: string;
	accentAlt: string;
	surface: string;
	line: string;
	chartGrid: string;
	chartColors: readonly string[];
	displayFont: string;
	bodyFont: string;
	displayWeight: number;
	layout: ThemeLayoutLanguage;
	imageFilter?: string;
}

export interface TemplateStyles {
	slideContent: CSSProperties;
	slideTitle: CSSProperties;
	slideSubtitle: CSSProperties;
	slideList: CSSProperties;
	slideTable: CSSProperties;
	slideTableTh: CSSProperties;
	slideTableTd: CSSProperties;
	slideQuote: CSSProperties;
	slideDescription: CSSProperties;
	slideHighlight: CSSProperties;
	slideStats: CSSProperties;
	slideKeypoint: CSSProperties;
	slideImage: CSSProperties;
	twoColumn: CSSProperties;
	column: CSSProperties;
}

export interface Template {
	id: string;
	name: string;
	description: string;
	styles: TemplateStyles;
	visual: ThemeVisualSystem;
	backgroundClass?: string;
}

function createTemplate({
	id,
	name,
	description,
	visual,
}: Omit<Template, "styles" | "backgroundClass">): Template {
	return {
		id,
		name,
		description,
		visual,
		styles: {
			slideContent: {
				width: "100%",
				height: "100%",
				boxSizing: "border-box",
				background: visual.background,
				color: visual.foreground,
				fontFamily: visual.bodyFont,
			},
			slideTitle: {
				color: visual.title,
				fontFamily: visual.displayFont,
				fontWeight: visual.displayWeight,
			},
			slideSubtitle: {
				color: visual.muted,
				fontFamily: visual.bodyFont,
			},
			slideList: {
				color: visual.foreground,
				fontFamily: visual.bodyFont,
			},
			slideTable: {
				color: visual.foreground,
				borderColor: visual.line,
			},
			slideTableTh: {
				background: visual.surface,
				color: visual.title,
				borderColor: visual.line,
			},
			slideTableTd: {
				color: visual.foreground,
				borderColor: visual.line,
			},
			slideQuote: {
				color: visual.title,
				fontFamily: visual.displayFont,
			},
			slideDescription: {
				color: visual.muted,
				fontFamily: visual.bodyFont,
			},
			slideHighlight: {
				background: visual.surface,
				color: visual.foreground,
			},
			slideStats: {
				color: visual.title,
			},
			slideKeypoint: {
				color: visual.foreground,
			},
			slideImage: {
				filter: visual.imageFilter,
			},
			twoColumn: {},
			column: {},
		},
	};
}

export const AVAILABLE_TEMPLATES: Template[] = [
	createTemplate({
		id: "modern-dark",
		name: "Midnight Terminal",
		description: "Cinematic technical narratives with calibrated terminal detail",
		visual: {
			background: "#090b12",
			foreground: "#f3f5f7",
			title: "#f3f5f7",
			muted: "#a8b2c6",
			accent: "#9b8cff",
			accentAlt: "#2fe1a3",
			surface: "#151927",
			line: "#30384e",
			chartGrid: "#2b3349",
			chartColors: ["#9b8cff", "#2fe1a3", "#5dc7e8", "#ff6b6b", "#f4c95d"],
			displayFont: "Inter, Avenir Next, Segoe UI, sans-serif",
			bodyFont: "Inter, Avenir Next, Segoe UI, sans-serif",
			displayWeight: 760,
			layout: "midnight-terminal",
		},
	}),
	createTemplate({
		id: "corporate-blue",
		name: "Signal Grid",
		description: "Measured strategy and data stories on a disciplined editorial grid",
		visual: {
			background: "#f7f7f2",
			foreground: "#172033",
			title: "#172f61",
			muted: "#5e6d83",
			accent: "#216ce7",
			accentAlt: "#12a594",
			surface: "#ffffff",
			line: "#d6dce5",
			chartGrid: "#dce3ed",
			chartColors: ["#216ce7", "#12a594", "#f2b641", "#8b5cf6", "#e16a50"],
			displayFont: "Inter, Avenir Next, Segoe UI, sans-serif",
			bodyFont: "Inter, Avenir Next, Segoe UI, sans-serif",
			displayWeight: 760,
			layout: "signal-grid",
		},
	}),
	createTemplate({
		id: "minimalist",
		name: "Monochrome Grid",
		description: "Quiet monochrome structure for plans, teaching, and clear thinking",
		visual: {
			background: "#fcfaf5",
			foreground: "#292824",
			title: "#171714",
			muted: "#756f66",
			accent: "#282722",
			accentAlt: "#a49d91",
			surface: "#f1ede5",
			line: "#d6d0c5",
			chartGrid: "#e0dacf",
			chartColors: ["#282722", "#6e7069", "#a49d91", "#c1b6a4", "#4c5d67"],
			displayFont: "Georgia, Times New Roman, serif",
			bodyFont: "Inter, Avenir Next, Segoe UI, sans-serif",
			displayWeight: 500,
			layout: "paper-grid",
			imageFilter: "grayscale(1) contrast(0.94)",
		},
	}),
	createTemplate({
		id: "creative-studio",
		name: "Kinetic Blocks",
		description: "Poster-like momentum for campaigns, workshops, and launches",
		visual: {
			background: "#fff9ef",
			foreground: "#161616",
			title: "#161616",
			muted: "#514d47",
			accent: "#f04428",
			accentAlt: "#2457d6",
			surface: "#ffd438",
			line: "#161616",
			chartGrid: "#e9dfca",
			chartColors: ["#f04428", "#2457d6", "#ffd438", "#2a9d8f", "#d9437f"],
			displayFont: "Arial Narrow, Inter, Avenir Next, sans-serif",
			bodyFont: "Inter, Avenir Next, Segoe UI, sans-serif",
			displayWeight: 800,
			layout: "kinetic-blocks",
			imageFilter: "saturate(1.12) contrast(1.04)",
		},
	}),
	createTemplate({
		id: "elegant-serif",
		name: "Editorial Ledger",
		description: "A warm, high-credibility editorial voice for considered decisions",
		visual: {
			background: "#f5f0e8",
			foreground: "#273031",
			title: "#1d2424",
			muted: "#756c61",
			accent: "#8d3427",
			accentAlt: "#3159a8",
			surface: "#ebe3d6",
			line: "#b7afa4",
			chartGrid: "#dcd3c7",
			chartColors: ["#8d3427", "#3159a8", "#b18952", "#506b58", "#6b536e"],
			displayFont: "Georgia, Times New Roman, serif",
			bodyFont: "Inter, Avenir Next, Segoe UI, sans-serif",
			displayWeight: 500,
			layout: "editorial-ledger",
			imageFilter: "sepia(0.14) contrast(0.96)",
		},
	}),
	createTemplate({
		id: "nature-green",
		name: "Field Report",
		description: "Human, grounded reporting for impact, research, and communities",
		visual: {
			background: "#fbf7ee",
			foreground: "#244d3d",
			title: "#244d3d",
			muted: "#617568",
			accent: "#4f7c5e",
			accentAlt: "#c76f50",
			surface: "#e8efdf",
			line: "#b7c6ad",
			chartGrid: "#d9e1d3",
			chartColors: ["#4f7c5e", "#c76f50", "#7b9cb5", "#9e805a", "#7f6a9a"],
			displayFont: "Georgia, Times New Roman, serif",
			bodyFont: "Inter, Avenir Next, Segoe UI, sans-serif",
			displayWeight: 600,
			layout: "field-notes",
			imageFilter: "saturate(0.86) contrast(0.96)",
		},
	}),
];

/**
 * Visual systems sold through the marketplace. They share no palette,
 * typography pairing, or layout language with AVAILABLE_TEMPLATES, so an
 * installed theme renders as its own studio identity instead of a recolored
 * built-in.
 */
export const MARKETPLACE_TEMPLATES: Template[] = [
	createTemplate({
		id: "neon-district",
		name: "Neon District",
		description: "After-hours synthwave glow for product drops and night-market energy",
		visual: {
			background: "#0d0518",
			foreground: "#f4ecff",
			title: "#fdf7ff",
			muted: "#9d8fc0",
			accent: "#ff2ea6",
			accentAlt: "#29e6ff",
			surface: "#1b0f2e",
			line: "#3d2560",
			chartGrid: "#33204f",
			chartColors: ["#ff2ea6", "#29e6ff", "#b78bff", "#ffe14d", "#5cff9d"],
			displayFont:
				"'JetBrains Mono', 'Cascadia Code', 'SF Mono', ui-monospace, Menlo, Consolas, monospace",
			bodyFont: "'Segoe UI', 'Helvetica Neue', Inter, Arial, sans-serif",
			displayWeight: 700,
			layout: "neon-district",
			imageFilter: "saturate(1.28) hue-rotate(-8deg) contrast(1.08)",
		},
	}),
	createTemplate({
		id: "draft-board",
		name: "Draft Board",
		description: "Blueprint linework and orange markups for engineering reviews and specs",
		visual: {
			background: "#103a63",
			foreground: "#dbeeff",
			title: "#f2f9ff",
			muted: "#8fb0d1",
			accent: "#ff9440",
			accentAlt: "#7fd1ff",
			surface: "#164674",
			line: "#4a79ad",
			chartGrid: "#2c567f",
			chartColors: ["#ff9440", "#7fd1ff", "#f2f9ff", "#ffd166", "#9be3c8"],
			displayFont: "'Century Gothic', 'Avant Garde', Futura, 'Trebuchet MS', sans-serif",
			bodyFont: "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif",
			displayWeight: 700,
			layout: "draft-board",
			imageFilter: "saturate(0.72) contrast(1.06)",
		},
	}),
	createTemplate({
		id: "velvet-marquee",
		name: "Velvet Marquee",
		description: "Black-tie theater glamour with champagne gold for galas and premieres",
		visual: {
			background: "#131010",
			foreground: "#f6efe4",
			title: "#faf4e8",
			muted: "#a89c88",
			accent: "#d4af6a",
			accentAlt: "#9c2b3a",
			surface: "#201a16",
			line: "#46392c",
			chartGrid: "#372c21",
			chartColors: ["#d4af6a", "#9c2b3a", "#7fa08c", "#b8b8ad", "#e0c79b"],
			displayFont: "'Didot', 'Bodoni MT', 'Playfair Display', Georgia, serif",
			bodyFont: "'Avenir Next', 'Segoe UI', Inter, sans-serif",
			displayWeight: 400,
			layout: "velvet-marquee",
			imageFilter: "sepia(0.24) contrast(1.03)",
		},
	}),
	createTemplate({
		id: "bubblegum-pop",
		name: "Bubblegum Pop",
		description: "Y2K candy pastels for community launches, clubs, and playful pitches",
		visual: {
			background: "#fff1f7",
			foreground: "#47203c",
			title: "#35142c",
			muted: "#96648a",
			accent: "#ff4fa3",
			accentAlt: "#37c8e8",
			surface: "#ffd9ec",
			line: "#f3bcd8",
			chartGrid: "#f7d3e6",
			chartColors: ["#ff4fa3", "#37c8e8", "#ffb84d", "#8e6ff0", "#54d98c"],
			displayFont: "'Trebuchet MS', Verdana, 'Segoe UI', sans-serif",
			bodyFont: "'Trebuchet MS', Verdana, 'Segoe UI', sans-serif",
			displayWeight: 800,
			layout: "bubblegum-pop",
			imageFilter: "saturate(1.18) brightness(1.04)",
		},
	}),
	createTemplate({
		id: "concrete-brutal",
		name: "Concrete Brutal",
		description: "Raw industrial slabs and safety-orange signage for bold internal truths",
		visual: {
			background: "#d8d8d3",
			foreground: "#101010",
			title: "#0a0a0a",
			muted: "#55564f",
			accent: "#e8490f",
			accentAlt: "#141414",
			surface: "#c7c7c1",
			line: "#9a9b93",
			chartGrid: "#b5b5ae",
			chartColors: ["#e8490f", "#141414", "#33658a", "#f2c230", "#808078"],
			displayFont: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
			bodyFont: "'Helvetica Neue', Arial, sans-serif",
			displayWeight: 900,
			layout: "concrete-brutal",
			imageFilter: "grayscale(1) contrast(1.15)",
		},
	}),
	createTemplate({
		id: "terra-mesa",
		name: "Terra Mesa",
		description: "Sun-baked adobe craft with sienna and turquoise for heritage stories",
		visual: {
			background: "#f8ead8",
			foreground: "#40291d",
			title: "#3a2317",
			muted: "#8c6f57",
			accent: "#c65a32",
			accentAlt: "#2f8f83",
			surface: "#efdcc2",
			line: "#d4b894",
			chartGrid: "#e3cbaa",
			chartColors: ["#c65a32", "#2f8f83", "#e0a458", "#7a5c8f", "#96b259"],
			displayFont: "'Rockwell', 'Bookman Old Style', Georgia, serif",
			bodyFont: "'Gill Sans', 'Avenir Next', 'Segoe UI', sans-serif",
			displayWeight: 600,
			layout: "terra-mesa",
			imageFilter: "sepia(0.26) saturate(0.92)",
		},
	}),
];

const DEFAULT_TEMPLATE_ID = "corporate-blue";

export function findTemplate(templateId: string): Template | undefined {
	return (
		AVAILABLE_TEMPLATES.find((template) => template.id === templateId) ||
		MARKETPLACE_TEMPLATES.find((template) => template.id === templateId)
	);
}

export function isDefaultTemplateId(templateId: string): boolean {
	return AVAILABLE_TEMPLATES.some((template) => template.id === templateId);
}

export function getTemplate(templateId: string): Template {
	const fallback = findTemplate(DEFAULT_TEMPLATE_ID);
	const template = findTemplate(templateId) || fallback;
	if (!template) throw new Error("The SlideSage default theme is unavailable.");
	return template;
}
