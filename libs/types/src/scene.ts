import type {
	ChartConfig,
	PresentationDimensions,
	PresentationOutline,
	SlideEffect,
	SlideTransition,
	Source,
	ThemeId,
} from "./index";

export const SCENE_PRESENTATION_SCHEMA_VERSION = 6 as const;
export const SCENE_ENGINE_VERSION = "1.0.0" as const;

export type SceneResponsiveProfile = "wide" | "standard" | "portrait" | "compact";
export type SceneLayoutMode = "absolute" | "stack" | "grid" | "overlay";
export type SceneDirection = "horizontal" | "vertical";
export type SceneAlignment = "start" | "center" | "end" | "stretch";
export type SceneDistribution = "start" | "center" | "end" | "space-between";
export type SceneTextRole = "display" | "title" | "subtitle" | "body" | "caption" | "label";

export interface SceneRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface SceneInsets {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface SceneSizeConstraint {
	width?: number;
	height?: number;
	minWidth?: number;
	maxWidth?: number;
	minHeight?: number;
	maxHeight?: number;
	grow?: number;
	aspectRatio?: number;
}

export interface SceneGridPlacement {
	column?: number;
	columnSpan?: number;
	row?: number;
	rowSpan?: number;
}

export interface SceneNodeStyle {
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
	radius?: number;
	opacity?: number;
	color?: string;
	fontFamily?: string;
	fontSize?: number;
	fontWeight?: number;
	lineHeight?: number;
	letterSpacing?: number;
	textAlign?: "left" | "center" | "right";
	shadow?: string;
}

export interface SceneNodeBase {
	id: string;
	order: number;
	bounds?: SceneRect;
	size?: SceneSizeConstraint;
	grid?: SceneGridPlacement;
	zIndex?: number;
	rotation?: number;
	hidden?: boolean;
	optional?: boolean;
	sourceIds?: string[];
	ariaLabel?: string;
	style?: SceneNodeStyle;
}

export interface SceneGroupNode extends SceneNodeBase {
	type: "group";
	layout: SceneLayoutMode;
	direction?: SceneDirection;
	gap?: number;
	padding?: Partial<SceneInsets>;
	align?: SceneAlignment;
	distribute?: SceneDistribution;
	columns?: number[];
	rows?: number[];
	clip?: boolean;
	children: SceneNode[];
}

export interface SceneTextNode extends SceneNodeBase {
	type: "text";
	role: SceneTextRole;
	text: string;
	maxLines?: number;
	minFontSize?: number;
}

export interface SceneImageNode extends SceneNodeBase {
	type: "image";
	url?: string;
	alt: string;
	caption?: string;
	fit: "cover" | "contain";
	focalPoint?: { x: number; y: number };
}

export interface SceneShapeNode extends SceneNodeBase {
	type: "shape";
	shape: "rectangle" | "ellipse" | "line";
}

export type SceneWidgetKind =
	| "chart"
	| "table"
	| "stats"
	| "quote"
	| "callout"
	| "timeline"
	| "process"
	| "comparison"
	| "architecture";

export interface SceneWidgetNode extends SceneNodeBase {
	type: "widget";
	kind: SceneWidgetKind;
	version: number;
	props: Record<string, unknown>;
}

export type SceneNode =
	| SceneGroupNode
	| SceneTextNode
	| SceneImageNode
	| SceneShapeNode
	| SceneWidgetNode;

export interface SceneNodePatch {
	nodeId: string;
	bounds?: SceneRect;
	hidden?: boolean;
	order?: number;
	style?: SceneNodeStyle;
	size?: SceneSizeConstraint;
	grid?: SceneGridPlacement;
}

export interface SceneVariant {
	profile: SceneResponsiveProfile;
	patches: SceneNodePatch[];
	root?: SceneGroupNode;
}

export interface SceneArtDirection {
	mood?: "editorial" | "minimal" | "expressive" | "technical" | "cinematic";
	density?: "airy" | "balanced" | "dense";
	background?: string;
	foreground?: string;
	accent?: string;
	muted?: string;
	imageTreatment?: "natural" | "monochrome" | "duotone" | "soft";
	motif?: "none" | "frame" | "rule" | "grid" | "orb";
}

export interface SceneThemeTokens {
	version: number;
	colors: {
		background: string;
		foreground: string;
		muted: string;
		accent: string;
		surface: string;
	};
	typography: {
		display: string;
		body: string;
	};
	radius: number;
	spacing: number;
}

export interface SceneSlide {
	id: string;
	type: "scene";
	root: SceneGroupNode;
	variants?: SceneVariant[];
	artDirection?: SceneArtDirection;
	semantic?: Record<string, unknown>;
	strategy?: string;
	transition?: SlideTransition;
	effects?: SlideEffect[];
}

export interface ScenePresentationDocument {
	schemaVersion: typeof SCENE_PRESENTATION_SCHEMA_VERSION;
	engineVersion: string;
	title: string;
	theme: ThemeId;
	themeTokens?: SceneThemeTokens;
	dimensions: PresentationDimensions;
	slides: SceneSlide[];
	totalSlides: number;
	outline?: PresentationOutline;
	sources?: Source[];
	status?: "ready" | "failed";
	tokens_used?: number;
}

export interface ResolvedSceneNode extends SceneNodeBase {
	type: SceneNode["type"];
	bounds: SceneRect;
	children?: ResolvedSceneNode[];
	text?: string;
	role?: SceneTextRole;
	maxLines?: number;
	minFontSize?: number;
	url?: string;
	alt?: string;
	fit?: "cover" | "contain";
	focalPoint?: { x: number; y: number };
	shape?: SceneShapeNode["shape"];
	kind?: SceneWidgetKind;
	version?: number;
	props?: Record<string, unknown>;
}

export interface SceneDiagnostic {
	code: "overflow" | "overlap" | "missing-asset" | "invalid-node" | "unsupported-widget";
	nodeId: string;
	message: string;
}

export interface ResolvedScene {
	slideId: string;
	profile: SceneResponsiveProfile;
	dimensions: PresentationDimensions;
	root: ResolvedSceneNode;
	diagnostics: SceneDiagnostic[];
}

export interface SceneChartWidgetProps {
	chartConfig: ChartConfig;
}
