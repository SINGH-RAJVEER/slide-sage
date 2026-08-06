import {
	type AIProvider,
	type OpenRouterMessage,
	PRESENTATION_NARRATIVE_ROLES,
	PRESENTATION_VISUAL_INTENTS,
	type PresentationNarrativeRole,
	type PresentationOutline,
	type PresentationOutlineCard,
	type PresentationVisualIntent,
} from "@slidesage/types";
import { recoverJson } from "../../utils/json-recovery";
import {
	OpenRouterStreamError,
	readOpenRouterStream,
	requestOpenRouterStream,
} from "../../utils/openrouter-stream";
import { SemanticCacheService, type SemanticCacheStatus } from "../semantic-cache.service";

interface PresentationOutlineOptions {
	provider?: AIProvider;
	apiKey?: string;
	model: string;
	messages: OpenRouterMessage[];
	slideCount: number;
	fallbackTitle: string;
	signal?: AbortSignal;
	cache?: {
		query: string;
		variant: Record<string, unknown>;
	};
}

export interface PresentationOutlineResult {
	outline: PresentationOutline;
	tokensUsed: number;
	cacheStatus: SemanticCacheStatus;
}

const NARRATIVE_ROLE_SET = new Set<string>(PRESENTATION_NARRATIVE_ROLES);
const VISUAL_INTENT_SET = new Set<string>(PRESENTATION_VISUAL_INTENTS);
const outlineCache = new SemanticCacheService();

function positiveInteger(name: string, fallback: number): number {
	const parsed = Number.parseInt(process.env[name] || "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanText(value: unknown, maximum: number): string {
	return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function cleanStringArray(value: unknown, maximumItems: number, maximumLength: number): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.slice(0, maximumItems)
		.map((item) => cleanText(item, maximumLength))
		.filter(Boolean);
}

function normalizeRole(
	value: unknown,
	index: number,
	slideCount: number
): PresentationNarrativeRole {
	if (typeof value === "string" && NARRATIVE_ROLE_SET.has(value)) {
		return value as PresentationNarrativeRole;
	}
	if (index === 0) return "opening";
	if (index === slideCount - 1) return "closing";
	return "insight";
}

function normalizeVisualIntent(value: unknown): PresentationVisualIntent {
	return typeof value === "string" && VISUAL_INTENT_SET.has(value)
		? (value as PresentationVisualIntent)
		: "none";
}

function normalizeOutlineCard(
	value: unknown,
	index: number,
	slideCount: number
): PresentationOutlineCard {
	const card =
		value && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	const title = cleanText(card["title"], 180) || `Slide ${index + 1}`;
	return {
		id: `card-${index + 1}`,
		title,
		objective: cleanText(card["objective"], 360) || `Explain ${title}`,
		keyPoints: cleanStringArray(card["keyPoints"], 5, 220),
		narrativeRole: normalizeRole(card["narrativeRole"], index, slideCount),
		visualIntent: index === 0 ? "none" : normalizeVisualIntent(card["visualIntent"]),
		sourceIds: cleanStringArray(card["sourceIds"], 8, 2048),
	};
}

function normalizeOutline(
	value: unknown,
	slideCount: number,
	fallbackTitle: string
): PresentationOutline {
	const outline =
		value && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	const cards = Array.isArray(outline["cards"]) ? outline["cards"] : [];
	if (cards.length !== slideCount) {
		throw new OpenRouterStreamError(
			`OpenRouter returned ${cards.length} of ${slideCount} requested outline cards`
		);
	}
	return {
		title: cleanText(outline["title"], 240) || fallbackTitle,
		audience: cleanText(outline["audience"], 240) || "General audience",
		thesis: cleanText(outline["thesis"], 500),
		cards: cards.map((card, index) => normalizeOutlineCard(card, index, slideCount)),
	};
}

function outlineResponseFormat(slideCount: number): Record<string, unknown> {
	return {
		type: "json_schema",
		json_schema: {
			name: "presentation_outline",
			strict: true,
			schema: {
				type: "object",
				properties: {
					title: { type: "string", maxLength: 240 },
					audience: { type: "string", maxLength: 240 },
					thesis: { type: "string", maxLength: 500 },
					cards: {
						type: "array",
						minItems: slideCount,
						maxItems: slideCount,
						items: {
							type: "object",
							properties: {
								title: { type: "string", maxLength: 180 },
								objective: { type: "string", maxLength: 360 },
								keyPoints: {
									type: "array",
									maxItems: 5,
									items: { type: "string", maxLength: 220 },
								},
								narrativeRole: { enum: [...PRESENTATION_NARRATIVE_ROLES] },
								visualIntent: { enum: [...PRESENTATION_VISUAL_INTENTS] },
								sourceIds: {
									type: "array",
									maxItems: 8,
									items: { type: "string", maxLength: 2048 },
								},
							},
							required: [
								"title",
								"objective",
								"keyPoints",
								"narrativeRole",
								"visualIntent",
								"sourceIds",
							],
							additionalProperties: false,
						},
					},
				},
				required: ["title", "audience", "thesis", "cards"],
				additionalProperties: false,
			},
		},
	};
}

export function buildOutlineMessages(messages: OpenRouterMessage[]): OpenRouterMessage[] {
	return [
		...messages.slice(0, -1),
		{
			role: "system",
			content: `Plan the presentation before drafting it. Return only the requested outline JSON. Build a coherent narrative, give every card one objective, and select a visual intent only when it strengthens the message. sourceIds must contain exact source URLs from the provided research context or be empty. Do not draft slide copy or choose a layout.`,
		},
		messages.at(-1) || { role: "user", content: "Plan the presentation." },
	];
}

export async function generatePresentationOutline(
	options: PresentationOutlineOptions
): Promise<PresentationOutlineResult> {
	let tokensUsed = 0;
	const load = async () => {
		const generated = await requestPresentationOutline(options);
		tokensUsed = generated.tokensUsed;
		return generated.outline;
	};

	if (!options.cache) {
		const outline = await load();
		return { outline, tokensUsed, cacheStatus: "bypass" };
	}

	const configuredTtl = Number.parseInt(process.env["OUTLINE_CACHE_TTL_SECONDS"] ?? "", 10);
	const ttlMs =
		(Number.isFinite(configuredTtl) && configuredTtl > 0 ? configuredTtl : 7 * 24 * 60 * 60) * 1000;
	const cached = await outlineCache.resolve<PresentationOutline>({
		namespace: "outline",
		query: options.cache.query,
		variant: {
			version: 1,
			provider: options.provider,
			model: options.model,
			slideCount: options.slideCount,
			...options.cache.variant,
		},
		ttlMs,
		load,
		isCacheable: () => true,
		isValid: (value): value is PresentationOutline => {
			try {
				normalizeOutline(value, options.slideCount, options.fallbackTitle);
				return true;
			} catch {
				return false;
			}
		},
	});

	return {
		outline: normalizeOutline(cached.payload, options.slideCount, options.fallbackTitle),
		tokensUsed: cached.status === "miss" ? tokensUsed : 0,
		cacheStatus: cached.status,
	};
}

async function requestPresentationOutline(
	options: PresentationOutlineOptions
): Promise<{ outline: PresentationOutline; tokensUsed: number }> {
	const endpoint = options.provider
		? undefined
		: process.env["OPEN_ROUTER_API_BASE"] || "https://openrouter.ai/api/v1/chat/completions";
	const apiKey = options.apiKey || process.env["OPEN_ROUTER_API_KEY"];
	if (!apiKey) {
		throw new OpenRouterStreamError(
			options.provider
				? "The selected AI provider is not configured."
				: "OpenRouter is not configured. Set OPEN_ROUTER_API_KEY."
		);
	}

	const response = await requestOpenRouterStream({
		endpoint,
		provider: options.provider,
		apiKey,
		model: options.model,
		messages: options.messages,
		requestTimeoutMs: positiveInteger("OPEN_ROUTER_REQUEST_TIMEOUT_MS", 180000),
		maxTokens: Math.min(8192, Math.max(2048, options.slideCount * 640)),
		responseFormat: outlineResponseFormat(options.slideCount),
		signal: options.signal,
	});
	let content = "";
	let tokensUsed = 0;
	for await (const chunk of readOpenRouterStream(response, {
		idleTimeoutMs: positiveInteger("OPEN_ROUTER_STREAM_IDLE_TIMEOUT_MS", 120000),
		maxResponseBytes: positiveInteger("OPEN_ROUTER_MAX_RESPONSE_BYTES", 8 * 1024 * 1024),
	})) {
		content += chunk.choices?.[0]?.delta?.content || "";
		if (chunk.usage?.total_tokens !== undefined) {
			tokensUsed = chunk.usage.total_tokens;
		}
	}
	if (!content.trim()) throw new OpenRouterStreamError("OpenRouter returned no outline content");

	try {
		return {
			outline: normalizeOutline(JSON.parse(content), options.slideCount, options.fallbackTitle),
			tokensUsed,
		};
	} catch (error) {
		if (error instanceof OpenRouterStreamError) throw error;
		const recovered = recoverJson(content, error as Error);
		return {
			outline: normalizeOutline(recovered.content, options.slideCount, options.fallbackTitle),
			tokensUsed,
		};
	}
}
