export interface ChartConfig {
    type: string;
    data: Record<string, unknown>;
    options?: Record<string, unknown>;
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
}

export interface ResearchPayload {
    summary?: string | null;
    sources: Source[];
}

export type ResearchFreshness = "day" | "week" | "month" | "year";

export interface ResearchOptions {
    enabled: boolean;
    provider?: "brave";
    freshness?: ResearchFreshness;
    maxResults?: number;
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

export interface StreamMidwayspaceEvent {
    event: "midwayspace";
    data: { summary: string | null; sources: Source[] };
}

export interface StreamResearchEvent {
    event: "research";
    data: {
        status: "searching" | "sourced" | "summarizing" | "ready" | "generating";
        sources?: Source[];
        summary?: string | null;
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
    | StreamMidwayspaceEvent
    | StreamResearchEvent
    | StreamThemeEvent
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
