import type { Slide, Source } from "@slide-sage/contracts";

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
} from "@slide-sage/contracts";

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
