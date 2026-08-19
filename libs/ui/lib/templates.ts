import type { CSSProperties } from "react";

export type ThemeLayoutLanguage =
	| "signal-grid"
	| "midnight-terminal"
	| "paper-grid"
	| "kinetic-blocks"
	| "editorial-ledger"
	| "field-notes";

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

export function getTemplate(templateId: string): Template {
	const fallback = AVAILABLE_TEMPLATES.find((template) => template.id === "corporate-blue");
	const template = AVAILABLE_TEMPLATES.find((item) => item.id === templateId) || fallback;
	if (!template) throw new Error("The SlideSage default theme is unavailable.");
	return template;
}
