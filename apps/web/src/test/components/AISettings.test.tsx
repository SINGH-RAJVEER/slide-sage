/// <reference lib="dom" />

import { afterEach, expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { AISettings } from "@/routes/settings/AISettings";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function jsonResponse(value: unknown): Response {
	return new Response(JSON.stringify(value), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

it("shows point-funded OpenRouter until a provider is connected", async () => {
	globalThis.fetch = mock(() =>
		Promise.resolve(
			jsonResponse({
				generation: {
					mode: "openrouter",
					model: "google/gemma-4-26b-a4b-it",
					billing: "points",
				},
				eligibility: {
					eligible: true,
					slideTokens: 100,
					minimumPointsExclusive: 50,
				},
				connections: [],
				models: [],
				selection: null,
			}),
		),
	) as unknown as typeof fetch;

	const view = render(<AISettings />);

	await view.findByRole("heading", { name: "API keys" });
	expect(view.queryByText("SlideSage")).not.toBeInTheDocument();
	expect(view.queryByText(/billing/i)).not.toBeInTheDocument();
	expect(view.getByRole("button", { name: "About API key security" })).toBeInTheDocument();
	expect(view.queryByRole("combobox")).not.toBeInTheDocument();
	for (const input of view.getAllByLabelText(/API key$/)) {
		expect(input).toHaveAttribute("type", "password");
	}
});

it("shows a provider-local model catalog error without hiding key controls", async () => {
	globalThis.fetch = mock(() =>
		Promise.resolve(
			jsonResponse({
				generation: { mode: "byok", model: "gpt-5.1", billing: "provider" },
				eligibility: {
					eligible: true,
					slideTokens: 100,
					minimumPointsExclusive: 50,
				},
				connections: [
					{
						provider: "openai",
						status: "valid",
						enabled: true,
						keyHint: "••••1234",
						validatedAt: "2026-01-01T00:00:00.000Z",
					},
				],
				models: [],
				modelCatalogErrors: {
					openai: "The provider model list is temporarily unavailable.",
				},
				selection: { provider: "openai", model: "gpt-5.1" },
			}),
		),
	) as unknown as typeof fetch;

	const view = render(<AISettings />);

	expect(
		await view.findByText("The provider model list is temporarily unavailable."),
	).toBeInTheDocument();
	expect(view.getByRole("switch", { name: "Use OpenAI for generation" })).toBeChecked();
	expect(view.queryByLabelText("OpenAI API key")).not.toBeInTheDocument();
});

it("updates the saved default model from settings", async () => {
	const config = {
		generation: { mode: "byok", model: "gpt-4.1", billing: "provider" },
		eligibility: { eligible: true, slideTokens: 100, minimumPointsExclusive: 50 },
		connections: [
			{
				provider: "openai",
				status: "valid",
				enabled: true,
				keyHint: "••••1234",
				validatedAt: "2026-01-01T00:00:00.000Z",
			},
		],
		models: [
			{
				provider: "openai",
				model: "gpt-4.1",
				label: "GPT-4.1",
				description: "High quality",
			},
			{
				provider: "openai",
				model: "gpt-4.1-mini",
				label: "GPT-4.1 mini",
				description: "Faster",
			},
		],
		selection: { provider: "openai", model: "gpt-4.1" },
	};
	const fetchMock = mock((_url: string | URL | Request, init?: RequestInit) => {
		if (init?.method === "PUT") {
			return Promise.resolve(
				jsonResponse({ selection: { provider: "openai", model: "gpt-4.1-mini" } }),
			);
		}
		return Promise.resolve(jsonResponse(config));
	});
	globalThis.fetch = fetchMock as unknown as typeof fetch;

	const view = render(<AISettings />);
	const selector = await view.findByRole("combobox", { name: "OpenAI model" });
	fireEvent.keyDown(selector, { key: "ArrowDown" });
	fireEvent.click(await view.findByRole("option", { name: "GPT-4.1 mini" }));

	expect(await view.findByText("Default generation model updated.")).toBeInTheDocument();

	const selectionRequest = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
	expect(selectionRequest?.[0]).toContain("/ai/selection");
	expect(JSON.parse(String(selectionRequest?.[1]?.body))).toEqual({
		provider: "openai",
		model: "gpt-4.1-mini",
	});
});

it("toggles a connected provider from the row without showing replacement controls", async () => {
	let enabled = true;
	const config = () => ({
		generation: enabled
			? { mode: "byok", model: "gpt-4.1", billing: "provider" }
			: { mode: "openrouter", model: null, billing: "points" },
		eligibility: { eligible: true, slideTokens: 100, minimumPointsExclusive: 50 },
		connections: [
			{
				provider: "openai",
				status: "valid",
				enabled,
				keyHint: "••••1234",
				validatedAt: "2026-01-01T00:00:00.000Z",
			},
		],
		models: [
			{
				provider: "openai",
				model: "gpt-4.1",
				label: "GPT-4.1",
				description: "High quality",
			},
		],
		selection: { provider: "openai", model: "gpt-4.1" },
	});
	const fetchMock = mock((url: string | URL | Request, init?: RequestInit) => {
		if (init?.method === "PUT" && String(url).includes("/ai/connections/openai/enabled")) {
			enabled = Boolean(JSON.parse(String(init.body)).enabled);
			return Promise.resolve(jsonResponse({ provider: "openai", enabled }));
		}
		return Promise.resolve(jsonResponse(config()));
	});
	globalThis.fetch = fetchMock as unknown as typeof fetch;

	const view = render(<AISettings />);
	const toggle = await view.findByRole("switch", { name: "Use OpenAI for generation" });
	expect(toggle).toBeChecked();
	expect(view.getByRole("button", { name: "Remove OpenAI" })).toBeInTheDocument();
	expect(view.queryByLabelText("OpenAI API key")).not.toBeInTheDocument();
	expect(view.queryByRole("button", { name: "Replace" })).not.toBeInTheDocument();

	fireEvent.click(toggle);

	expect(await view.findByText(/OpenAI paused/)).toBeInTheDocument();
	const request = fetchMock.mock.calls.find(
		([url, init]) =>
			init?.method === "PUT" && String(url).includes("/ai/connections/openai/enabled"),
	);
	expect(JSON.parse(String(request?.[1]?.body))).toEqual({ enabled: false });
	expect(view.getByText("Connected ••••1234")).toBeInTheDocument();
});

it("allows selecting a Gemini model after enabling its connected provider", async () => {
	let enabled = false;
	let selection: { provider: "google"; model: string } | null = null;
	const config = () => ({
		generation: { mode: "openrouter" as const, model: null, billing: "points" as const },
		eligibility: { eligible: true, slideTokens: 100, minimumPointsExclusive: 50 },
		connections: [
			{
				provider: "google" as const,
				status: "valid" as const,
				enabled,
				keyHint: "••••1234",
				validatedAt: "2026-01-01T00:00:00.000Z",
			},
		],
		models: [
			{
				provider: "google" as const,
				model: "gemini-2.5-flash",
				label: "Gemini 2.5 Flash",
				description: "Fast",
			},
		],
		selection,
	});
	globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
		if (init?.method === "PUT" && String(url).includes("/ai/connections/google/enabled")) {
			enabled = Boolean(JSON.parse(String(init.body)).enabled);
			return Promise.resolve(jsonResponse({ provider: "google", enabled }));
		}
		if (init?.method === "PUT" && String(url).includes("/ai/selection")) {
			selection = JSON.parse(String(init.body)) as { provider: "google"; model: string };
			return Promise.resolve(jsonResponse({ selection }));
		}
		return Promise.resolve(jsonResponse(config()));
	}) as unknown as typeof fetch;

	const view = render(<AISettings />);
	const toggle = await view.findByRole("switch", { name: "Use Google Gemini for generation" });
	fireEvent.click(toggle);

	await waitFor(() => expect(toggle).toBeChecked());
	await waitFor(() => expect(selection).toEqual({ provider: "google", model: "gemini-2.5-flash" }));
	expect(view.getByRole("combobox", { name: "Google Gemini model" })).toBeEnabled();
});

it("selects the top model when enabling OpenAI or Anthropic", async () => {
	for (const provider of [
		{ id: "openai" as const, label: "OpenAI", model: "gpt-5-mini" },
		{ id: "anthropic" as const, label: "Anthropic", model: "claude-haiku-4-5" },
	]) {
		let enabled = false;
		let selection: { provider: typeof provider.id; model: string } | null = null;
		const config = () => ({
			generation: { mode: "openrouter" as const, model: null, billing: "points" as const },
			eligibility: { eligible: true, slideTokens: 100, minimumPointsExclusive: 50 },
			connections: [
				{
					provider: provider.id,
					status: "valid" as const,
					enabled,
					keyHint: "••••1234",
					validatedAt: "2026-01-01T00:00:00.000Z",
				},
			],
			models: [
				{
					provider: provider.id,
					model: provider.model,
					label: provider.model,
					description: "Default",
				},
			],
			selection,
		});
		globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
			if (init?.method === "PUT" && String(url).includes(`/ai/connections/${provider.id}/enabled`)) {
				enabled = Boolean(JSON.parse(String(init.body)).enabled);
				return Promise.resolve(jsonResponse({ provider: provider.id, enabled }));
			}
			if (init?.method === "PUT" && String(url).includes("/ai/selection")) {
				selection = JSON.parse(String(init.body)) as typeof selection;
				return Promise.resolve(jsonResponse({ selection }));
			}
			return Promise.resolve(jsonResponse(config()));
		}) as unknown as typeof fetch;

		const view = render(<AISettings />);
		fireEvent.click(
			await view.findByRole("switch", { name: `Use ${provider.label} for generation` }),
		);
		await waitFor(() => expect(selection).toEqual({ provider: provider.id, model: provider.model }));
		view.unmount();
	}
});

it("removes a connected provider from the delete icon", async () => {
	let connected = true;
	const config = () => ({
		generation: connected
			? { mode: "byok", model: "gpt-4.1", billing: "provider" }
			: { mode: "openrouter", model: null, billing: "points" },
		eligibility: { eligible: true, slideTokens: 100, minimumPointsExclusive: 50 },
		connections: connected
			? [
					{
						provider: "openai",
						status: "valid",
						enabled: true,
						keyHint: "••••1234",
						validatedAt: "2026-01-01T00:00:00.000Z",
					},
				]
			: [],
		models: connected
			? [
					{
						provider: "openai",
						model: "gpt-4.1",
						label: "GPT-4.1",
						description: "High quality",
					},
				]
			: [],
		selection: connected ? { provider: "openai", model: "gpt-4.1" } : null,
	});
	const fetchMock = mock((url: string | URL | Request, init?: RequestInit) => {
		if (init?.method === "DELETE" && String(url).includes("/ai/connections/openai")) {
			connected = false;
			return Promise.resolve(new Response(null, { status: 204 }));
		}
		return Promise.resolve(jsonResponse(config()));
	});
	globalThis.fetch = fetchMock as unknown as typeof fetch;

	const view = render(<AISettings />);
	fireEvent.click(await view.findByRole("button", { name: "Remove OpenAI" }));

	expect(
		await view.findByText("Provider removed. OpenRouter resumes when no connections remain."),
	).toBeInTheDocument();
	expect(view.queryByRole("button", { name: "Remove OpenAI" })).not.toBeInTheDocument();
	expect(view.getByLabelText("OpenAI API key")).toBeInTheDocument();
	const request = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
	expect(request?.[0]).toContain("/ai/connections/openai");
});

it("replaces the loading indicator with an error when settings fail to load", async () => {
	globalThis.fetch = mock(() =>
		Promise.reject(new Error("Settings service unavailable")),
	) as unknown as typeof fetch;

	const view = render(<AISettings />);

	expect(view.getByLabelText("Loading AI settings")).toBeInTheDocument();
	expect(await view.findByRole("alert")).toHaveTextContent("Settings service unavailable");
	expect(view.queryByLabelText("Loading AI settings")).toBeNull();
});

it("reports a Cloudflare HTML fallback instead of treating it as settings", async () => {
	globalThis.fetch = mock(() =>
		Promise.resolve(
			new Response("<!DOCTYPE html><title>SlideSage</title>", {
				status: 200,
				headers: { "Content-Type": "text/html" },
			}),
		),
	) as unknown as typeof fetch;

	const view = render(<AISettings />);

	expect(await view.findByRole("alert")).toHaveTextContent(
		"The AI settings service returned an invalid response.",
	);
});
