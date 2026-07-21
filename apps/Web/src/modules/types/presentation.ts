import type { Slide, Source } from "@slide-sage/types";

export type {
    BaseSlide,
    BulletBlock,
    CalloutBlock,
    ChartConfig,
    ChartSlide,
    ContentSlide,
    ImageBlock,
    ImagePlaceholderBlock,
    LegacyHtmlSlide,
    ParagraphBlock,
    PresentationData,
    PresentationJSON,
    PresentationLayoutPreference,
    PresentationStreamEvent,
    ResearchFreshness,
    ResearchOptions,
    ResearchPayload,
    Slide,
    SlideBlock,
    SlideLayout,
    SlideRegion,
    Source,
    StatsBlock,
    StreamCompleteEvent,
    StreamCreatedEvent,
    StreamErrorEvent,
    StreamEvent,
    StreamResearchEvent,
    StreamSavedEvent,
    StreamSlideEvent,
    StreamStartEvent,
    StreamThemeEvent,
    StructuredSlide,
    TableBlock,
    ThemeId,
} from "@slide-sage/types";

export {
    isChartSlide,
    isContentSlide,
    isLegacyHtmlSlide,
    PRESENTATION_SCHEMA_VERSION,
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
    researchSources?: Source[];
    researchStatus?: "idle" | "searching" | "ready" | "generating";
}
