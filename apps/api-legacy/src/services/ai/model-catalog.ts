export const DEFAULT_OPENROUTER_MODEL = "google/gemma-4-26b-a4b-it";

export function configuredOpenRouterModel(): string {
	return process.env["OPEN_ROUTER_MODEL"] || DEFAULT_OPENROUTER_MODEL;
}
