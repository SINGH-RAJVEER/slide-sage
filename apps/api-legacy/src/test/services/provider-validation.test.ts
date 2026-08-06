import { describe, expect, it, mock } from "bun:test";
import {
	ProviderValidationError,
	validateProviderKey,
} from "../../services/ai/provider-validation";

describe("provider key validation", () => {
	it("uses Google's paginated model catalog and returns generation models", async () => {
		const fetchImpl = mock((url: string | URL | Request, init?: RequestInit) => {
			expect(String(url)).toContain("generativelanguage.googleapis.com/v1beta/models");
			expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("google-key");
			if (String(url).includes("pageToken=next-page")) {
				return Promise.resolve(
					Response.json({
						models: [
							{
								name: "models/gemini-future-pro",
								displayName: "Gemini Future Pro",
								supportedGenerationMethods: ["generateContent"],
							},
						],
					})
				);
			}
			return Promise.resolve(
				Response.json({
					models: [
						{
							name: "models/gemini-2.5-flash",
							baseModelId: "gemini-2.5-flash",
							displayName: "Gemini 2.5 Flash",
							description: "Fast multimodal generation",
							supportedGenerationMethods: ["generateContent", "countTokens"],
						},
						{
							name: "models/text-embedding-004",
							supportedGenerationMethods: ["embedContent"],
						},
					],
					nextPageToken: "next-page",
				})
			);
		}) as unknown as typeof fetch;

		const models = await validateProviderKey("google", "google-key", undefined, fetchImpl);

		expect(models.map((model) => model.model)).toEqual(["gemini-2.5-flash", "gemini-future-pro"]);
		expect(models[0]).toEqual({
			provider: "google",
			model: "gemini-2.5-flash",
			label: "Gemini 2.5 Flash",
			description: "Fast multimodal generation",
			recommended: true,
		});
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("filters OpenAI's returned catalog without a static model ID allowlist", async () => {
		const fetchImpl = mock(() =>
			Promise.resolve(
				Response.json({
					data: [
						{ id: "gpt-5.99-future", created: 20 },
						{ id: "text-embedding-4", created: 30 },
						{ id: "gpt-4.1", created: 10 },
						{ id: "gpt-3.5-turbo", created: 40 },
					],
				})
			)
		) as unknown as typeof fetch;

		const models = await validateProviderKey("openai", "openai-key", undefined, fetchImpl);

		expect(models.map((model) => model.model)).toEqual(["gpt-5.99-future", "gpt-4.1"]);
		expect(models[0]?.recommended).toBe(true);
	});

	it("follows Anthropic pagination and keeps structured-output models", async () => {
		const fetchImpl = mock((url: string | URL | Request) => {
			const value = String(url);
			if (!value.includes("after_id=")) {
				return Promise.resolve(
					Response.json({
						data: [
							{
								id: "claude-next",
								display_name: "Claude Next",
								capabilities: { structured_outputs: { supported: true } },
							},
							{
								id: "claude-legacy",
								capabilities: { structured_outputs: { supported: false } },
							},
						],
						has_more: true,
						last_id: "claude-legacy",
					})
				);
			}
			expect(value).toContain("after_id=claude-legacy");
			return Promise.resolve(
				Response.json({
					data: [
						{
							id: "claude-second-page",
							display_name: "Claude Second Page",
							capabilities: { structured_outputs: { supported: true } },
						},
					],
					has_more: false,
				})
			);
		}) as unknown as typeof fetch;

		const models = await validateProviderKey("anthropic", "anthropic-key", undefined, fetchImpl);

		expect(models.map((model) => model.model)).toEqual(["claude-next", "claude-second-page"]);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("uses Anthropic's versioned transport and rejects zero compatible models", async () => {
		const fetchImpl = mock((url: string | URL | Request, init?: RequestInit) => {
			expect(String(url)).toBe("https://api.anthropic.com/v1/models?limit=1000");
			const headers = new Headers(init?.headers);
			expect(headers.get("x-api-key")).toBe("anthropic-key");
			expect(headers.get("anthropic-version")).toBe("2023-06-01");
			return Promise.resolve(Response.json({ data: [{ id: "unrelated-model" }] }));
		}) as unknown as typeof fetch;

		try {
			await validateProviderKey("anthropic", "anthropic-key", undefined, fetchImpl);
			throw new Error("Expected validation to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(ProviderValidationError);
			expect((error as ProviderValidationError).incompatible).toBe(true);
		}
	});
});
