export interface ChartConfig {
	type: "bar" | "line" | "pie" | "doughnut" | "radar" | "polarArea";
	data: {
		labels: string[];
		datasets: Array<{
			label?: string;
			data: number[];
			backgroundColor?: string | string[];
			borderColor?: string | string[];
			borderWidth?: number;
			fill?: boolean;
		}>;
	};
	options?: Record<string, unknown>;
	title?: string;
	description?: string;
	[key: string]: unknown;
}

export const PRESENTATION_SCHEMA_VERSION = 5 as const;

export type {
	ResolvedScene,
	ResolvedSceneNode,
	SceneAlignment,
	SceneArtDirection,
	SceneChartWidgetProps,
	SceneDiagnostic,
	SceneDirection,
	SceneDistribution,
	SceneGridPlacement,
	SceneGroupNode,
	SceneImageNode,
	SceneInsets,
	SceneLayoutMode,
	SceneNode,
	SceneNodeBase,
	SceneNodePatch,
	SceneNodeStyle,
	ScenePresentationDocument,
	SceneRect,
	SceneResponsiveProfile,
	SceneShapeNode,
	SceneSizeConstraint,
	SceneSlide,
	SceneTextNode,
	SceneTextRole,
	SceneThemeTokens,
	SceneVariant,
	SceneWidgetKind,
	SceneWidgetNode,
} from "./scene";
export { SCENE_ENGINE_VERSION, SCENE_PRESENTATION_SCHEMA_VERSION } from "./scene";
export type { SceneCommand } from "./scene-commands";
export { applySceneCommand, findSceneNode, invertSceneCommand } from "./scene-commands";
export { resolveScene, sceneForProfile, slideToScene, validateSceneSlide } from "./scene-engine";

export interface PresentationDimensions {
	width: number;
	height: number;
}

export type SlideTransitionType = "none" | "fade" | "slide" | "zoom" | "morph";

export interface SlideTransition {
	type: SlideTransitionType;
	durationMs?: number;
}

export interface SlideEffect {
	id: string;
	type: "fade-in" | "count-up" | "ken-burns";
	targetBlockId?: string;
	order?: number;
	durationMs?: number;
}

export const THEME_IDS = [
	"modern-dark",
	"corporate-blue",
	"minimalist",
	"creative-studio",
	"elegant-serif",
	"nature-green",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const PRESENTATION_NARRATIVE_ROLES = [
	"opening",
	"context",
	"problem",
	"insight",
	"solution",
	"evidence",
	"comparison",
	"process",
	"recommendation",
	"closing",
] as const;

export type PresentationNarrativeRole = (typeof PRESENTATION_NARRATIVE_ROLES)[number];

export const PRESENTATION_VISUAL_INTENTS = [
	"none",
	"image",
	"chart",
	"table",
	"quote",
	"stats",
] as const;

export type PresentationVisualIntent = (typeof PRESENTATION_VISUAL_INTENTS)[number];

export interface PresentationOutlineCard {
	id: string;
	title: string;
	objective: string;
	keyPoints: string[];
	narrativeRole: PresentationNarrativeRole;
	visualIntent: PresentationVisualIntent;
	sourceIds: string[];
}

export interface PresentationOutline {
	title: string;
	audience: string;
	thesis: string;
	cards: PresentationOutlineCard[];
}

export type PresentationGenerationStage =
	| "researching"
	| "planning"
	| "drafting"
	| "designing"
	| "finalizing";

export const SLIDE_LAYOUTS = [
	"cover",
	"section",
	"body",
	"split",
	"comparison",
	"sidebar",
	"media-left",
	"media-right",
	"quote",
	"spotlight",
	"canvas",
] as const;
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];

export const SLIDE_REGIONS = ["main", "primary", "secondary", "media"] as const;
export type SlideRegion = (typeof SLIDE_REGIONS)[number];

export const SLIDE_TONES = ["default", "muted", "accent", "inverse"] as const;
export type SlideTone = (typeof SLIDE_TONES)[number];

export const SLIDE_DENSITIES = ["airy", "standard", "compact"] as const;
export type SlideDensity = (typeof SLIDE_DENSITIES)[number];

export const SLIDE_PATTERNS = ["none", "grid", "dots", "diagonal"] as const;
export type SlidePattern = (typeof SLIDE_PATTERNS)[number];

export const BACKGROUND_FOCAL_POINTS = ["center", "top", "bottom", "left", "right"] as const;
export type BackgroundFocalPoint = (typeof BACKGROUND_FOCAL_POINTS)[number];

export const BACKGROUND_OVERLAYS = ["none", "subtle", "medium", "strong"] as const;
export type BackgroundOverlay = (typeof BACKGROUND_OVERLAYS)[number];

export const BLOCK_EMPHASES = ["standard", "strong", "hero", "supporting"] as const;
export type BlockEmphasis = (typeof BLOCK_EMPHASES)[number];

export const BLOCK_TREATMENTS = ["plain", "card", "outline", "accent"] as const;
export type BlockTreatment = (typeof BLOCK_TREATMENTS)[number];

export interface SlideBackgroundImage {
	url: string;
	alt: string;
	focalPoint: BackgroundFocalPoint;
	overlay: BackgroundOverlay;
}

export interface BaseSlideBlock {
	id?: string;
	region: SlideRegion;
	sourceIds?: string[];
	emphasis?: BlockEmphasis;
	treatment?: BlockTreatment;
}

export interface ParagraphBlock extends BaseSlideBlock {
	type: "paragraph";
	text: string;
}

export interface BulletBlock extends BaseSlideBlock {
	type: "bullets";
	items: string[];
	ordered: boolean;
}

export interface TableBlock extends BaseSlideBlock {
	type: "table";
	headers: string[];
	rows: string[][];
}

export interface ImageBlock extends BaseSlideBlock {
	type: "image";
	url: string;
	alt: string;
	caption: string;
}

export interface ImagePlaceholderBlock extends BaseSlideBlock {
	type: "image-placeholder";
	alt: string;
	caption: string;
}

export interface QuoteBlock extends BaseSlideBlock {
	type: "quote";
	text: string;
	attribution: string;
}

export interface CalloutBlock extends BaseSlideBlock {
	type: "callout";
	heading: string;
	text: string;
}

export interface StatsBlock extends BaseSlideBlock {
	type: "stats";
	items: Array<{
		value: string;
		label: string;
	}>;
}

export const WIDGET_KINDS = ["timeline", "flow", "architecture", "comparison"] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

export const WIDGET_NODE_ROLES = [
	"default",
	"start",
	"end",
	"decision",
	"actor",
	"system",
	"data",
] as const;
export type WidgetNodeRole = (typeof WIDGET_NODE_ROLES)[number];

export const WIDGET_TONES = ["neutral", "accent", "positive", "warning", "danger"] as const;
export type WidgetTone = (typeof WIDGET_TONES)[number];

export const WIDGET_DIRECTIONS = ["horizontal", "vertical"] as const;
export type WidgetDirection = (typeof WIDGET_DIRECTIONS)[number];

export const MAX_WIDGET_NODES = 16;
export const MAX_WIDGET_EDGES = 32;

export interface WidgetNode {
	id: string;
	label: string;
	description: string;
	value: string;
	role: WidgetNodeRole;
	tone: WidgetTone;
	parentId: string;
}

export interface WidgetEdge {
	from: string;
	to: string;
	label: string;
}

export interface WidgetBlock extends BaseSlideBlock {
	type: "widget";
	version: 1;
	kind: WidgetKind;
	direction: WidgetDirection;
	nodes: WidgetNode[];
	edges: WidgetEdge[];
}

export type SlideBlock =
	| ParagraphBlock
	| BulletBlock
	| TableBlock
	| ImageBlock
	| ImagePlaceholderBlock
	| QuoteBlock
	| CalloutBlock
	| StatsBlock
	| WidgetBlock;

export interface BaseSlide {
	id: string;
	type: "content" | "chart";
	transition?: SlideTransition;
	effects?: SlideEffect[];
}

export interface ContentSlide extends BaseSlide {
	type: "content";
	layout: SlideLayout;
	title: string;
	subtitle: string;
	eyebrow?: string;
	regionLabels?: Partial<Record<SlideRegion, string>>;
	tone: SlideTone;
	density: SlideDensity;
	pattern: SlidePattern;
	backgroundImage?: SlideBackgroundImage;
	blocks: SlideBlock[];
}

export interface LegacyHtmlSlide {
	id: string;
	type: string;
	html: string;
	transition?: SlideTransition;
	effects?: SlideEffect[];
}

export interface ChartSlide extends BaseSlide {
	type: "chart";
	chartConfig: ChartConfig;
}

export type StructuredSlide = ContentSlide | ChartSlide;
export type Slide = StructuredSlide | LegacyHtmlSlide | import("./scene").SceneSlide;

export function isSceneSlide(slide: Slide): slide is import("./scene").SceneSlide {
	return slide.type === "scene";
}

export function isLegacyHtmlSlide(slide: Slide): slide is LegacyHtmlSlide {
	return slide.type !== "scene" && "html" in slide;
}

export function isChartSlide(slide: Slide): slide is ChartSlide {
	return !isSceneSlide(slide) && !isLegacyHtmlSlide(slide) && slide.type === "chart";
}

export function isContentSlide(slide: Slide): slide is ContentSlide {
	return !isSceneSlide(slide) && !isLegacyHtmlSlide(slide) && slide.type === "content";
}

export interface Source {
	url: string;
	title?: string;
	snippet?: string;
	retrieved_at?: string;
	published_date?: string;
	author?: string;
	highlights?: string[];
	summary?: string;
}

export interface ResearchPayload {
	sources: Source[];
	estimated_tokens?: number;
}

export const AI_PROVIDERS = ["openai", "google", "anthropic"] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

export interface AIModelSelection {
	provider: AIProvider;
	model: string;
}

export interface AIModelDescriptor extends AIModelSelection {
	label: string;
	description: string;
	recommended?: boolean;
}

export interface AIConnectionSummary {
	provider: AIProvider;
	status: "valid" | "invalid";
	keyHint: string;
	validatedAt: string;
	lastUsedAt?: string;
}

export interface AIConfigurationResponse {
	generation: {
		mode: "openrouter" | "byok";
		model: string | null;
		billing: "points" | "provider";
	};
	eligibility: {
		eligible: boolean;
		slideTokens: number;
		minimumPointsExclusive: 50;
	};
	connections: AIConnectionSummary[];
	models: AIModelDescriptor[];
	modelCatalogErrors?: Partial<Record<AIProvider, string>>;
	selection: AIModelSelection | null;
}

export interface UpsertAIConnectionRequest {
	provider: AIProvider;
	apiKey: string;
}

export interface UpdateAISelectionRequest extends AIModelSelection {}

export { buildResearchSystemMessage, estimateMessageInputTokens } from "./research-context";

export type ResearchFreshness = "day" | "week" | "month" | "year";

export interface ResearchOptions {
	enabled: boolean;
	freshness?: ResearchFreshness;
	maxResults?: number;
	includeDomains?: string[];
	excludeDomains?: string[];
	startPublishedDate?: string;
	endPublishedDate?: string;
	maxAgeHours?: number;
}

export interface PresentationData {
	schemaVersion?: number;
	title: string;
	theme: string;
	dimensions?: PresentationDimensions;
	slides: Slide[];
	totalSlides: number;
	sources?: Source[];
	tokens_used?: number;
	engineVersion?: string;
	outline?: PresentationOutline;
	outline_cache_status?: "bypass" | "exact-hit" | "semantic-hit" | "miss";
}

export type PresentationStatus = "generating" | "ready" | "failed";

export interface PresentationRetryOptions {
	prompt: string;
	slide_count: number;
	detail_level: string;
	tonality: string;
	research_enabled: boolean;
	theme?: ThemeId;
	research_payload?: ResearchPayload;
	ai?: AIModelSelection;
}

export interface PresentationFailure {
	message: string;
	retry: PresentationRetryOptions;
}

export interface PresentationJSON {
	schemaVersion?: number;
	title: string;
	theme: string;
	dimensions?: PresentationDimensions;
	slides: Slide[];
	status?: PresentationStatus;
	failure?: PresentationFailure;
	totalSlides?: number;
	tokens_used?: number;
	sources?: Source[];
	outline?: PresentationOutline;
	outline_cache_status?: "bypass" | "exact-hit" | "semantic-hit" | "miss";
	[key: string]: unknown;
}

export type PresentationMutation =
	| {
			type: "update-presentation";
			title?: string;
			theme?: ThemeId;
			dimensions?: PresentationDimensions;
	  }
	| { type: "update-slide"; slideId: string; slide: Slide }
	| { type: "delete-slide"; slideId: string }
	| { type: "reorder-slides"; slideIds: string[] };

export interface PresentationMutationRequest {
	mutations: PresentationMutation[];
}

export interface StreamStartEvent {
	event: "start";
	data: { status: string };
}

export interface StreamCreatedEvent {
	event: "created";
	data: { presentation_id: string | number };
}

export interface StreamThemeEvent {
	event: "theme";
	data: { theme: string };
}

export interface StreamResearchEvent {
	event: "research";
	data: {
		status: "searching" | "ready" | "generating";
		sources?: Source[];
	};
}

export interface StreamStageEvent {
	event: "stage";
	data: {
		stage: PresentationGenerationStage;
		message: string;
		completed: number;
		total: number;
	};
}

export interface StreamOutlineEvent {
	event: "outline";
	data: PresentationOutline;
}

export interface StreamSlideEvent {
	event: "slide";
	data: {
		slide: Slide;
		index: number;
		title: string | null;
	};
}

export interface StreamRetryEvent {
	event: "retry";
	data: {
		attempt: number;
		max_attempts: number;
		delay_ms: number;
		reason: string;
	};
}

export interface StreamCompleteEvent {
	event: "complete";
	data: PresentationJSON;
}

export interface StreamSavedEvent {
	event: "saved";
	data: {
		presentation_id: string | number;
		success?: boolean;
		slide_tokens_remaining?: number | null;
		slide_tokens_charged?: number;
	};
}

export interface StreamErrorEvent {
	event: "error";
	data: {
		error: string;
		presentation_id?: string | number;
		details?: unknown;
		[key: string]: unknown;
	};
}

export type PresentationStreamEvent =
	| StreamStartEvent
	| StreamCreatedEvent
	| StreamResearchEvent
	| StreamStageEvent
	| StreamOutlineEvent
	| StreamThemeEvent
	| StreamRetryEvent
	| StreamSlideEvent
	| StreamCompleteEvent
	| StreamSavedEvent
	| StreamErrorEvent;

export type StreamEvent = PresentationStreamEvent;

export interface OpenRouterMessage {
	role: string;
	content: string;
}

export interface StreamChunk {
	choices?: Array<{
		delta?: {
			content?: string;
		};
	}>;
	usage?: {
		total_tokens?: number;
	};
}

export interface ApiErrorResponse {
	error: {
		message: string;
		code?: string;
	};
}

export interface PresentationSummary {
	id: string;
	title: string;
	prompt: string;
	slide_count: number;
	status: PresentationStatus;
	has_research: boolean;
	created_at: string;
	updated_at: string;
}

export interface PresentationsResponse {
	presentations: PresentationSummary[];
	total: number;
	limit: number;
	offset: number;
	has_more: boolean;
}

export interface SavedPresentation {
	id: string;
	title: string;
	prompt: string;
	slides_data: PresentationJSON;
	created_at: string;
	updated_at: string;
}

export interface PresentationResponse {
	presentation: SavedPresentation;
}

export interface UserProfile {
	id: string;
	name: string | null;
	email: string;
	image: string | null;
	emailVerified: boolean;
	slideTokens: number;
	createdAt: string;
}

export interface ProfileResponse {
	user: UserProfile;
}

export interface UpdateProfileRequest {
	name?: string;
	email?: string;
	currentPassword?: string;
	newPassword?: string;
}

export interface UpdateAvatarRequest {
	imageUrl: string;
}

export interface ProfileAvatarResponse {
	user: Pick<UserProfile, "id" | "image">;
}

export type BillingPackName = "starter" | "pro" | "premium" | "custom";

export interface BillingBalanceResponse {
	slide_tokens: number;
}

export interface BillingCheckoutRequest {
	pack: BillingPackName;
	quantity?: number;
}

export interface BillingCheckoutResponse {
	orderId: string;
	amount: number;
	currency: string;
	tokens: number;
	keyId: string;
}

export interface BillingVerifyRequest {
	razorpay_order_id: string;
	razorpay_payment_id: string;
	razorpay_signature: string;
}

export interface BillingVerifyResponse {
	success: true;
	tokens_awarded: number;
	new_balance: number;
}

export type { WidgetBlockLike, WidgetSpecV1 } from "./presentation";
