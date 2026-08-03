import type { SemanticCommandSeed, SemanticTemplateSeed } from "./types";

export const DEFAULT_EMBEDDING_MODEL = "nvidia/llama-nemotron-embed-vl-1b-v2:free";

export const DEFAULT_SLIDE_TEMPLATES: SemanticTemplateSeed[] = [
    {
        templateName: "Problem Slide",
        templateDescription:
            "Frames a user pain, business problem, urgency, root cause, and why the audience should care.",
        slideType: "content",
        schemaHint: { sections: ["problem", "evidence", "impact"] },
    },
    {
        templateName: "Solution Slide",
        templateDescription:
            "Explains the product, approach, value proposition, and how the solution resolves the stated problem.",
        slideType: "content",
        schemaHint: { sections: ["solution", "capabilities", "benefits"] },
    },
    {
        templateName: "Market Size Slide",
        templateDescription:
            "Shows TAM, SAM, SOM, market growth, key statistics, and assumptions behind the opportunity.",
        slideType: "chart",
        schemaHint: { chart: "bar", sections: ["market", "growth", "assumptions"] },
    },
    {
        templateName: "Competitive Matrix",
        templateDescription:
            "Compares companies, products, or alternatives across dimensions like pricing, quality, adoption, and differentiation.",
        slideType: "content",
        schemaHint: { layout: "comparison_matrix" },
    },
    {
        templateName: "Timeline Roadmap",
        templateDescription:
            "Presents future plans, milestones, release schedule, implementation phases, or a next twelve months roadmap.",
        slideType: "content",
        schemaHint: { layout: "timeline" },
    },
    {
        templateName: "Architecture Diagram",
        templateDescription:
            "Explains technical systems, data flow, platform layers, integrations, and how components connect.",
        slideType: "content",
        schemaHint: { layout: "architecture" },
    },
    {
        templateName: "Case Study Slide",
        templateDescription:
            "Summarizes customer context, intervention, measurable results, lessons, and proof points.",
        slideType: "content",
        schemaHint: { sections: ["customer", "action", "results"] },
    },
    {
        templateName: "SWOT Analysis",
        templateDescription:
            "Organizes strengths, weaknesses, opportunities, and threats into a strategic analysis.",
        slideType: "content",
        schemaHint: { layout: "quadrant" },
    },
];

export const DEFAULT_SEMANTIC_COMMANDS: SemanticCommandSeed[] = [
    {
        commandText: "make shorter, condense, summarize, reduce text",
        intent: "make_shorter",
        route: "content_edit",
    },
    {
        commandText: "make more technical, add depth, explain implementation details",
        intent: "increase_technical_depth",
        route: "content_edit",
    },
    {
        commandText: "add statistics, latest market data, citations, sources, current facts",
        intent: "add_grounded_data",
        route: "data_search_edit",
    },
    {
        commandText: "change tone, make more investor focused, professional, persuasive, casual",
        intent: "change_tone",
        route: "style_edit",
    },
    {
        commandText: "simplify, make easier to understand, reduce jargon",
        intent: "simplify",
        route: "content_edit",
    },
    {
        commandText: "turn into a table, comparison, matrix, or structured layout",
        intent: "change_layout",
        route: "layout_edit",
    },
    {
        commandText: "make visual, add chart, diagram, timeline, roadmap, architecture",
        intent: "make_visual",
        route: "layout_edit",
    },
    {
        commandText: "add a new slide, insert section, create another slide",
        intent: "insert_slide",
        route: "slide_insertion",
    },
    {
        commandText: "delete slide, remove section, drop this content",
        intent: "delete_slide",
        route: "slide_deletion",
    },
    {
        commandText: "apply same style, match previous version, keep consistent branding",
        intent: "reuse_style",
        route: "style_memory",
    },
];
