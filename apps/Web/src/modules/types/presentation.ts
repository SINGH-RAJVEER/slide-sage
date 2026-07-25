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
    SlideLayout,
    SlideRegion,
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
} from "@slide-sage/types";

export {
    isChartSlide,
    isContentSlide,
    isLegacyHtmlSlide,
    isSceneSlide,
    PRESENTATION_SCHEMA_VERSION,
    resolveScene,
    slideToScene,
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
