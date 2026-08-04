import type { Slide, Source, WidgetBlock } from "@slidesage/types";

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
    PresentationDimensions,
    PresentationGenerationStage,
    PresentationJSON,
    PresentationOutline,
    PresentationOutlineCard,
    PresentationStreamEvent,
    ResearchFreshness,
    ResearchOptions,
    ResearchPayload,
    ResolvedScene,
    ResolvedSceneNode,
    SceneArtDirection,
    SceneGroupNode,
    SceneNode,
    ScenePresentationDocument,
    SceneResponsiveProfile,
    SceneSlide,
    SceneThemeTokens,
    SceneWidgetKind,
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
    StreamOutlineEvent,
    StreamResearchEvent,
    StreamSavedEvent,
    StreamSlideEvent,
    StreamStageEvent,
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
} from "@slidesage/types";

export {
    isChartSlide,
    isContentSlide,
    isLegacyHtmlSlide,
    isSceneSlide,
    PRESENTATION_SCHEMA_VERSION,
    resolveScene,
    slideToScene,
} from "@slidesage/types";

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
