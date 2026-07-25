import type { ContentSlide, PresentationData, SlideLayout, ThemeId } from "@slide-sage/types";

export interface MarketplaceItem {
    id: string;
    name: string;
    description: string;
    author: string;
    authorInitials: string;
    votes: number;
    uses: string;
    tags: string[];
    featured?: boolean;
    themeId: ThemeId;
    layoutId: SlideLayout;
    previewSlide: ContentSlide;
}

function previewSlide(
    id: string,
    title: string,
    subtitle: string,
    layout: SlideLayout,
    blocks: ContentSlide["blocks"],
): ContentSlide {
    return {
        id,
        type: "content",
        layout,
        title,
        subtitle,
        blocks,
    };
}

export const MARKETPLACE_ITEMS: MarketplaceItem[] = [
    {
        id: "midnight-signal",
        name: "Midnight Signal",
        description: "A high-contrast dark system for product launches and technical narratives.",
        author: "Amina K.",
        authorInitials: "AK",
        votes: 842,
        uses: "3.4k",
        tags: ["Dark", "Product", "Launch"],
        featured: true,
        themeId: "modern-dark",
        layoutId: "content",
        previewSlide: previewSlide(
            "market-midnight",
            "Signals over noise",
            "The product brief, distilled",
            "content",
            [
                {
                    type: "stats",
                    region: "main",
                    items: [
                        { label: "Activation", value: "+42%" },
                        { label: "Time saved", value: "18h" },
                    ],
                },
            ],
        ),
    },
    {
        id: "field-notes",
        name: "Field Notes",
        description: "A grounded editorial palette for research, climate, and impact reporting.",
        author: "Noah Field",
        authorInitials: "NF",
        votes: 614,
        uses: "2.1k",
        tags: ["Editorial", "Research", "Warm"],
        featured: true,
        themeId: "nature-green",
        layoutId: "two-column",
        previewSlide: previewSlide(
            "market-field",
            "Regrowth is measurable",
            "A field report from the northern corridor",
            "two-column",
            [
                {
                    type: "callout",
                    heading: "Measured recovery",
                    text: "64 hectares restored",
                    region: "left",
                },
                {
                    type: "paragraph",
                    text: "Local stewardship changed the curve in under twelve months.",
                    region: "right",
                },
            ],
        ),
    },
    {
        id: "founder-letter",
        name: "Founder Letter",
        description:
            "Restrained serif typography for strategy, annual reviews, and investor updates.",
        author: "Studio North",
        authorInitials: "SN",
        votes: 497,
        uses: "1.8k",
        tags: ["Serif", "Strategy", "Elegant"],
        themeId: "elegant-serif",
        layoutId: "quote",
        previewSlide: previewSlide(
            "market-founder",
            "Conviction compounds",
            "Letter to our partners",
            "quote",
            [
                {
                    type: "quote",
                    region: "main",
                    text: "Build the company you would want to discover ten years from now.",
                    attribution: "2026 outlook",
                },
            ],
        ),
    },
    {
        id: "boardroom-clear",
        name: "Boardroom Clear",
        description: "A structured business theme designed for decision-heavy executive sessions.",
        author: "Maya Chen",
        authorInitials: "MC",
        votes: 731,
        uses: "4.7k",
        tags: ["Business", "Data", "Clean"],
        themeId: "corporate-blue",
        layoutId: "content",
        previewSlide: previewSlide(
            "market-boardroom",
            "The decision in one page",
            "Three indicators point in the same direction",
            "content",
            [
                {
                    type: "bullets",
                    region: "main",
                    ordered: false,
                    items: [
                        "Demand is durable",
                        "Margins are expanding",
                        "Execution risk is contained",
                    ],
                },
            ],
        ),
    },
];

export function createMarketplacePreviewPresentation(item: MarketplaceItem): PresentationData {
    const slides: ContentSlide[] = [
        {
            ...item.previewSlide,
            id: `${item.id}-preview-title`,
            layout: "title",
            blocks: [],
        },
        {
            id: `${item.id}-preview-story`,
            type: "content",
            layout: "two-column",
            title: "A system for clear stories",
            subtitle: "Built to carry one visual voice across every idea",
            blocks: [
                {
                    id: `${item.id}-preview-principle`,
                    type: "callout",
                    region: "left",
                    heading: "One principle",
                    text: "Make the hierarchy obvious before adding decoration.",
                },
                {
                    id: `${item.id}-preview-details`,
                    type: "bullets",
                    region: "right",
                    ordered: false,
                    items: ["Purposeful typography", "Consistent color", "Calm composition"],
                },
            ],
        },
        {
            id: `${item.id}-preview-impact`,
            type: "content",
            layout: "content",
            title: "Designed to make the point land",
            subtitle: "A sample data story",
            blocks: [
                {
                    id: `${item.id}-preview-stats`,
                    type: "stats",
                    region: "main",
                    items: [
                        { value: "3.4x", label: "Faster comprehension" },
                        { value: "72%", label: "Stronger recall" },
                        { value: "1", label: "Cohesive system" },
                    ],
                },
            ],
        },
        {
            id: `${item.id}-preview-close`,
            type: "content",
            layout: "quote",
            title: "Make the story unmistakable",
            subtitle: item.name,
            blocks: [
                {
                    id: `${item.id}-preview-quote`,
                    type: "quote",
                    region: "main",
                    text: "A strong theme should guide the audience, not compete for attention.",
                    attribution: item.author,
                },
            ],
        },
    ];

    return {
        schemaVersion: 3,
        title: `${item.name} theme preview`,
        theme: item.themeId,
        dimensions: { width: 1280, height: 720 },
        slides,
        totalSlides: slides.length,
    };
}
