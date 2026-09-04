/** Browser-only semantic preview IDs. These are not PowerPoint template IDs. */
export const THEME_IDS = [
	"modern-dark",
	"corporate-blue",
	"minimalist",
	"creative-studio",
	"elegant-serif",
	"nature-green",
] as const;

/**
 * Browser-only semantic preview IDs. These are not PowerPoint templates.
 * Marketplace preview themes must be installed before they appear in the
 * viewer theme dropdown.
 */
export const MARKETPLACE_THEME_IDS = [
	"neon-district",
	"draft-board",
	"velvet-marquee",
	"bubblegum-pop",
	"concrete-brutal",
	"terra-mesa",
] as const;

export type MarketplaceThemeId = (typeof MARKETPLACE_THEME_IDS)[number];

const ALL_THEME_IDS = [...THEME_IDS, ...MARKETPLACE_THEME_IDS] as const;

export type ThemeId = (typeof ALL_THEME_IDS)[number];

export type {
	BinaryPptxTemplate,
	BinaryTemplateAspectRatio,
	BinaryTemplateAssetStatus,
	BinaryTemplateAvailability,
	BinaryTemplateDimensions,
	PresentationTemplateReference,
} from "./template-catalog";
export {
	BINARY_PPTX_TEMPLATE_CATALOG,
	DEFAULT_BINARY_PPTX_TEMPLATE,
} from "./template-catalog";

export type PresentationGenerationStage =
	| "researching"
	| "assigning"
	| "drafting"
	| "compiling"
	| "finalizing";

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
	enabled: boolean;
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

export interface UpdateAIConnectionEnabledRequest {
	enabled: boolean;
}

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

export type PresentationDocumentKind = "legacy" | "pptx";

export type PresentationPreviewStatus = "pending" | "rendering" | "ready" | "failed";

/** One immutable PPTX revision. Downloads and previews both come from it. */
export interface PresentationRevision {
	revision: number;
	slideCount: number;
	byteSize: number;
	sha256: string;
	previewStatus: PresentationPreviewStatus;
	previewCount: number;
	createdAt: string;
}

export interface PresentationData {
	title: string;
	template: import("./template-catalog").PresentationTemplateReference;
	documentKind: PresentationDocumentKind;
	currentRevision?: PresentationRevision;
	totalSlides: number;
	sources?: Source[];
	tokens_used?: number;
	outline_cache_status?: "bypass" | "exact-hit" | "semantic-hit" | "miss";
}

export type PresentationStatus = "generating" | "ready" | "failed";

export interface PresentationRetryOptions {
	prompt: string;
	slide_count: number;
	detail_level: string;
	tonality: string;
	research_enabled: boolean;
	research_payload?: ResearchPayload;
	ai?: AIModelSelection;
	template?: import("./template-catalog").PresentationTemplateReference;
}

export interface PresentationFailure {
	message: string;
	retry: PresentationRetryOptions;
}

export interface PresentationJSON {
	title: string;
	template?: import("./template-catalog").PresentationTemplateReference;
	documentKind?: PresentationDocumentKind;
	currentRevision?: PresentationRevision;
	status?: PresentationStatus;
	failure?: PresentationFailure;
	totalSlides?: number;
	tokens_used?: number;
	sources?: Source[];
	outline_cache_status?: "bypass" | "exact-hit" | "semantic-hit" | "miss";
	[key: string]: unknown;
}

export type PresentationMutation = {
	type: "update-presentation";
	title?: string;
};

export interface PresentationMutationRequest {
	mutations: PresentationMutation[];
}

export interface StreamStartEvent {
	event: "start";
	data: { status: string };
}

export interface StreamCreatedEvent {
	event: "created";
	data: { job_id?: string; presentation_id: string | number };
}

export type GenerationJobStatus =
	| "queued"
	| "running"
	| "retrying"
	| "succeeded"
	| "failed"
	| "cancelled";

export interface GenerationJob {
	id: string;
	presentation_id: string;
	kind: "generation" | "iteration";
	status: GenerationJobStatus;
	stage?: PresentationGenerationStage;
	progress: { completed: number; total: number };
	error?: string;
	created_at: string;
	updated_at: string;
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

export interface StreamRevisionEvent {
	event: "revision";
	data: PresentationRevision;
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
	| StreamRetryEvent
	| StreamRevisionEvent
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

export const LANDING_PAGES = ["generate", "presentations"] as const;
export type LandingPage = (typeof LANDING_PAGES)[number];

export interface UserProfile {
	id: string;
	name: string | null;
	email: string;
	image: string | null;
	emailVerified: boolean;
	slideTokens: number;
	landingPage: LandingPage;
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
	landingPage?: LandingPage;
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

