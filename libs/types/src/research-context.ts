import type { Source } from "./index";

const MAX_RESEARCH_SOURCES = 8;
const CHAT_MESSAGE_OVERHEAD_TOKENS = 4;
const CONSERVATIVE_BYTES_PER_TOKEN = 3;

export function buildResearchSystemMessage(sources: Source[], originalQuery: string): string {
	const trimmedQuery = String(originalQuery ?? "").trim();
	const cappedSources = sources.slice(0, MAX_RESEARCH_SOURCES);

	return `WEB RESEARCH MODE IS ENABLED.

The user requested that you vet factual claims with recent information. Use the RESEARCH SOURCES below for any time-sensitive or factual details.

Rules:
- Prefer these sources over general knowledge for dates, stats, versions, pricing, or "latest" info.
- Do NOT invent citations or facts. If sources don't support a claim, either omit it or mark it as uncertain in slide notes.
- You may add a "notes" field on slides to include brief citations like: "Sources: https://example.com, ...".
- Output must still be a single valid JSON object (no markdown).

User topic: ${trimmedQuery || "(not provided)"}

RESEARCH SOURCES (JSON):
${JSON.stringify(cappedSources, null, 2)}`;
}

/**
 * Estimate input tokens before OpenRouter returns model-native usage. JSON and URLs
 * tokenize densely, so three UTF-8 bytes per token is used to avoid underquoting.
 */
export function estimateMessageInputTokens(message: string): number {
	if (!message) return 0;

	const byteLength = new TextEncoder().encode(message).byteLength;
	return Math.ceil(byteLength / CONSERVATIVE_BYTES_PER_TOKEN) + CHAT_MESSAGE_OVERHEAD_TOKENS;
}
