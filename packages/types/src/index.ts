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

export interface BaseSlide {
    id: string;
    type: string;
}

export interface HtmlSlide extends BaseSlide {
    html: string;
}

export interface ChartSlide extends BaseSlide {
    type: "chart";
    chartConfig: ChartConfig;
}

export type Slide = HtmlSlide | ChartSlide;

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
    title: string;
    theme: string;
    slides: Slide[];
    totalSlides: number;
    sources?: Source[];
    tokens_used?: number;
}

export interface PresentationJSON {
    title: string;
    theme: string;
    slides: Slide[];
    totalSlides?: number;
    tokens_used?: number;
    sources?: Source[];
    [key: string]: unknown;
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
    data: { presentation_id: string | number };
}

export interface StreamErrorEvent {
    event: "error";
    data: { error: string; details?: unknown; [key: string]: unknown };
}

export type PresentationStreamEvent =
    | StreamStartEvent
    | StreamCreatedEvent
    | StreamResearchEvent
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
    created_at: string;
    updated_at: string;
}

export interface PresentationsResponse {
    presentations: PresentationSummary[];
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
