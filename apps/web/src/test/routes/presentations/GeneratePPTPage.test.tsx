/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { StreamingProvider } from "@/modules/contexts/StreamingContext";
import GeneratePPTPage from "@/routes/presentations/GeneratePPTPage";

function RouteStateProbe() {
	const location = useLocation();
	return <pre>{JSON.stringify(location.state)}</pre>;
}

it("prefills a failed presentation prompt and generation options", () => {
	const view = render(
		<MemoryRouter
			initialEntries={[
				{
					pathname: "/generate",
					state: {
						retry: {
							prompt: "Retry this market analysis",
							slide_count: 12,
							detail_level: "comprehensive",
							tonality: "casual",
							research_enabled: true,
							theme: "nature-green",
						},
					},
				},
			]}
		>
			<StreamingProvider>
				<Routes>
					<Route path="/generate" element={<GeneratePPTPage />} />
				</Routes>
			</StreamingProvider>
		</MemoryRouter>,
	);

	expect(view.getByRole("textbox", { name: "Presentation prompt" })).toHaveValue(
		"Retry this market analysis",
	);
	expect(view.getByDisplayValue("12")).toBeInTheDocument();
	expect(view.getByText("Comprehensive")).toBeInTheDocument();
	expect(view.getByText("Casual")).toBeInTheDocument();
	expect(view.getByRole("button", { name: /Web Research/ })).toHaveClass("bg-white/10");
	expect(view.getByRole("button", { name: "Generate" })).not.toBeDisabled();
});

it("opens the viewer immediately while generation waits for the stream", async () => {
	const originalFetch = globalThis.fetch;
	const fetchMock = mock((input: string | URL | Request, _init?: RequestInit) =>
		String(input).includes("/ai/config")
			? Promise.resolve(
					new Response(
						JSON.stringify({
							generation: {
								mode: "openrouter",
								model: "openrouter/default",
								billing: "points",
							},
							eligibility: {
								eligible: false,
								slideTokens: 10,
								minimumPointsExclusive: 50,
							},
							connections: [],
							models: [],
							selection: null,
						}),
						{ headers: { "Content-Type": "application/json" } },
					),
				)
			: new Promise<Response>(() => {}),
	);
	globalThis.fetch = fetchMock as unknown as typeof fetch;

	try {
		const view = render(
			<MemoryRouter
				initialEntries={[
					{
						pathname: "/generate",
						state: {
							retry: {
								prompt: "Immediate viewer navigation, with launch risks\nand pricing",
								slide_count: 5,
								detail_level: "balanced",
								tonality: "professional",
								research_enabled: false,
								ai: {
									provider: "anthropic",
									model: "claude-sonnet-4-20250514",
								},
							},
						},
					},
				]}
			>
				<StreamingProvider>
					<Routes>
						<Route path="/generate" element={<GeneratePPTPage />} />
						<Route path="/presentation" element={<div>Viewer waiting for stream</div>} />
					</Routes>
				</StreamingProvider>
			</MemoryRouter>,
		);

		fireEvent.click(view.getByRole("button", { name: "Generate" }));

		await waitFor(() =>
			expect(
				fetchMock.mock.calls.some(([input]) =>
					String(input).includes("/generate-presentation-stream"),
				),
			).toBe(true),
		);
		expect(view.getByText("Viewer waiting for stream")).toBeInTheDocument();
		const generationRequest = fetchMock.mock.calls.find(([input]) =>
			String(input).includes("/generate-presentation-stream"),
		);
		const requestBody = JSON.parse(
			String((generationRequest?.[1] as RequestInit | undefined)?.body),
		) as Record<string, unknown>;
		expect(requestBody["topic"]).toBe(
			"Immediate viewer navigation, with launch risks\nand pricing",
		);
		expect(requestBody["ai"]).toEqual({
			provider: "anthropic",
			model: "claude-sonnet-4-20250514",
		});
	} finally {
		globalThis.fetch = originalFetch;
	}
});

it("preserves retry AI selection when routing through research", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = mock(async () =>
		Response.json({
			generation: { mode: "byok", model: "gpt-4.1", billing: "provider" },
			eligibility: { eligible: true, slideTokens: 100, minimumPointsExclusive: 50 },
			connections: [],
			models: [],
			selection: null,
		}),
	) as unknown as typeof fetch;

	try {
		const view = render(
			<MemoryRouter
				initialEntries={[
					{
						pathname: "/generate",
						state: {
							retry: {
								prompt: "Research this retry",
								slide_count: 6,
								detail_level: "detailed",
								tonality: "professional",
								research_enabled: true,
								ai: { provider: "openai", model: "gpt-4.1" },
							},
							retryPresentationId: "failed_1",
						},
					},
				]}
			>
				<StreamingProvider>
					<Routes>
						<Route path="/generate" element={<GeneratePPTPage />} />
						<Route path="/generate/research" element={<RouteStateProbe />} />
					</Routes>
				</StreamingProvider>
			</MemoryRouter>,
		);

		fireEvent.click(view.getByRole("button", { name: "Generate" }));

		await waitFor(() =>
			expect(view.getByText(/"retryPresentationId":"failed_1"/)).toBeInTheDocument(),
		);
		expect(view.getByText(/"provider":"openai","model":"gpt-4.1"/)).toBeInTheDocument();
	} finally {
		globalThis.fetch = originalFetch;
	}
});
