import type {
    ChartSlide,
    ContentSlide,
    PresentationData,
    Slide,
    SlideLayout,
    ThemeId,
} from "@slidesage/types";

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
    isNew?: boolean;
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
        tone: "default",
        density: "standard",
        pattern: "none",
        blocks,
    };
}

export const MARKETPLACE_ITEMS: MarketplaceItem[] = [
    {
        id: "citrus-brief",
        name: "Citrus Brief",
        description: "A crisp, optimistic system for campaigns, workshops, and growth narratives.",
        author: "SlideSage",
        authorInitials: "SS",
        votes: 389,
        uses: "1.2k",
        tags: ["Bright", "Campaign", "Workshop"],
        featured: true,
        isNew: true,
        themeId: "creative-studio",
        layoutId: "split",
        previewSlide: previewSlide(
            "market-citrus",
            "Momentum has a color",
            "Turn the next quarter into a visible movement",
            "split",
            [
                {
                    id: "market-citrus-left",
                    type: "callout",
                    region: "primary",
                    heading: "Make it tangible",
                    text: "One message. Three decisive actions.",
                },
                {
                    id: "market-citrus-right",
                    type: "stats",
                    region: "secondary",
                    items: [{ value: "86%", label: "Team alignment" }],
                },
            ],
        ),
    },
    {
        id: "paper-grid",
        name: "Paper Grid",
        description: "A precise monochrome theme for operating plans, teaching, and documentation.",
        author: "SlideSage",
        authorInitials: "SS",
        votes: 326,
        uses: "980",
        tags: ["Minimal", "Planning", "Education"],
        featured: true,
        isNew: true,
        themeId: "minimalist",
        layoutId: "body",
        previewSlide: previewSlide(
            "market-paper-grid",
            "Structure creates speed",
            "A practical operating system for complex work",
            "body",
            [
                {
                    id: "market-paper-grid-list",
                    type: "bullets",
                    region: "main",
                    ordered: true,
                    items: ["Define the constraint", "Name the owner", "Measure the outcome"],
                },
            ],
        ),
    },
    {
        id: "midnight-signal",
        name: "Midnight Signal",
        description: "A high-contrast dark system for product launches and technical narratives.",
        author: "SlideSage",
        authorInitials: "SS",
        votes: 842,
        uses: "3.4k",
        tags: ["Dark", "Product", "Launch"],
        featured: true,
        themeId: "modern-dark",
        layoutId: "spotlight",
        previewSlide: previewSlide(
            "market-midnight",
            "Signals over noise",
            "The product brief, distilled",
            "spotlight",
            [
                {
                    id: "market-midnight-stats",
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
        author: "SlideSage",
        authorInitials: "SS",
        votes: 614,
        uses: "2.1k",
        tags: ["Editorial", "Research", "Warm"],
        featured: true,
        themeId: "nature-green",
        layoutId: "split",
        previewSlide: previewSlide(
            "market-field",
            "Regrowth is measurable",
            "A field report from the northern corridor",
            "split",
            [
                {
                    id: "market-field-callout",
                    type: "callout",
                    heading: "Measured recovery",
                    text: "64 hectares restored",
                    region: "primary",
                },
                {
                    id: "market-field-copy",
                    type: "paragraph",
                    text: "Local stewardship changed the curve in under twelve months.",
                    region: "secondary",
                },
            ],
        ),
    },
    {
        id: "founder-letter",
        name: "Founder Letter",
        description:
            "Restrained serif typography for strategy, annual reviews, and investor updates.",
        author: "SlideSage",
        authorInitials: "SS",
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
                    id: "market-founder-quote",
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
        author: "SlideSage",
        authorInitials: "SS",
        votes: 731,
        uses: "4.7k",
        tags: ["Business", "Data", "Clean"],
        themeId: "corporate-blue",
        layoutId: "body",
        previewSlide: previewSlide(
            "market-boardroom",
            "The decision in one page",
            "Three indicators point in the same direction",
            "body",
            [
                {
                    id: "market-boardroom-list",
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
    const chartSlides: ChartSlide[] = [
        {
            id: `${item.id}-preview-growth-chart`,
            type: "chart",
            chartConfig: {
                type: "line",
                title: "Momentum compounds across the year",
                description: "A representative trend view using the selected theme.",
                data: {
                    labels: ["Q1", "Q2", "Q3", "Q4"],
                    datasets: [
                        {
                            label: "Adoption",
                            data: [24, 41, 67, 89],
                            borderColor: "#60a5fa",
                            backgroundColor: "rgba(96, 165, 250, 0.18)",
                            borderWidth: 3,
                            fill: true,
                        },
                    ],
                },
            },
        },
        {
            id: `${item.id}-preview-mix-chart`,
            type: "chart",
            chartConfig: {
                type: "doughnut",
                title: "A balanced communication mix",
                description: "Charts inherit the preview theme's surrounding visual system.",
                data: {
                    labels: ["Narrative", "Evidence", "Action"],
                    datasets: [
                        {
                            data: [42, 34, 24],
                            backgroundColor: ["#60a5fa", "#34d399", "#f59e0b"],
                            borderColor: ["#bfdbfe", "#a7f3d0", "#fde68a"],
                            borderWidth: 2,
                        },
                    ],
                },
            },
        },
    ];
    const slides: Slide[] = [
        {
            ...item.previewSlide,
            id: `${item.id}-preview-title`,
            layout: "cover",
            blocks: [],
        },
        {
            id: `${item.id}-preview-story`,
            type: "content",
            layout: "split",
            title: "A system for clear stories",
            subtitle: "Built to carry one visual voice across every idea",
            tone: "default",
            density: "standard",
            pattern: "none",
            blocks: [
                {
                    id: `${item.id}-preview-principle`,
                    type: "callout",
                    region: "primary",
                    heading: "One principle",
                    text: "Make the hierarchy obvious before adding decoration.",
                },
                {
                    id: `${item.id}-preview-details`,
                    type: "bullets",
                    region: "secondary",
                    ordered: false,
                    items: ["Purposeful typography", "Consistent color", "Calm composition"],
                },
            ],
        },
        ...chartSlides,
        {
            id: `${item.id}-preview-impact`,
            type: "content",
            layout: "spotlight",
            title: "Designed to make the point land",
            subtitle: "A sample data story",
            tone: "accent",
            density: "standard",
            pattern: "none",
            blocks: [
                {
                    id: `${item.id}-preview-stats`,
                    type: "stats",
                    region: "primary",
                    emphasis: "hero",
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
            tone: "default",
            density: "airy",
            pattern: "none",
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
        schemaVersion: 5,
        title: `${item.name} theme preview`,
        theme: item.themeId,
        dimensions: { width: 1280, height: 720 },
        slides,
        totalSlides: slides.length,
    };
}
