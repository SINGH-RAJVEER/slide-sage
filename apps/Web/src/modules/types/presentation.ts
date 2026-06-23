import type { Slide, Source } from "@slide-sage/types";

export type {
    BaseSlide,
    ChartConfig,
    ChartSlide,
    HtmlSlide,
    PresentationData,
    PresentationJSON,
    PresentationStreamEvent,
    ResearchFreshness,
    ResearchOptions,
    ResearchPayload,
    Slide,
    Source,
    StreamCompleteEvent,
    StreamCreatedEvent,
    StreamErrorEvent,
    StreamEvent,
    StreamMidwayspaceEvent,
    StreamResearchEvent,
    StreamSavedEvent,
    StreamSlideEvent,
    StreamStartEvent,
    StreamThemeEvent,
} from "@slide-sage/types";

// Streaming presentation state
export interface StreamingPresentationState {
    isStreaming: boolean;
    theme?: string;
    title?: string;
    slides: Slide[];
    totalSlides?: number;
    presentationId?: number;
    error?: string;
    researchSummary?: string;
    researchSources?: Source[];
    researchStatus?: "idle" | "searching" | "sourced" | "summarizing" | "ready" | "generating";
}
