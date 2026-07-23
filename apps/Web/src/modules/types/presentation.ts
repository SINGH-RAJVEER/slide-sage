import type { Slide, Source, WidgetBlock } from "@slide-sage/types";

export type WidgetSpecV1 = Pick<WidgetBlock, "version" | "kind" | "direction" | "nodes" | "edges">;
export type WidgetBlockLike = WidgetBlock;

export type {
    BaseSlide,
    BlockEmphasis,
    BlockTreatment,
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
    SlideDensity,
    SlideLayout,
    SlidePattern,
    SlideRegion,
    SlideTone,
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
    WidgetBlock,
    WidgetDirection,
    WidgetEdge,
    WidgetKind,
    WidgetNode,
    WidgetNodeRole,
    WidgetTone,
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
