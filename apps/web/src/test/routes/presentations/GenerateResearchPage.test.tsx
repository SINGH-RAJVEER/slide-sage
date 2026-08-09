/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { StreamingProvider } from "@/modules/contexts/StreamingContext";
import GenerateResearchPage from "@/routes/presentations/GenerateResearchPage";

function AwayPage() {
	const navigate = useNavigate();

	return (
		<div>
			<span>Presentations</span>
			<button type="button" onClick={() => navigate(1)}>
				Return to research
			</button>
		</div>
	);
}

describe("GenerateResearchPage", () => {
	it("shows saved retry sources without repeating the research request", async () => {
		const originalFetch = globalThis.fetch;
		const fetchMock = mock(async () => new Response(null, { status: 500 }));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		try {
			const view = render(
				<MemoryRouter
					initialEntries={[
						{
							pathname: "/generate/research",
							state: {
								prompt: "Saved research topic",
								slideCount: 7,
								detailLevel: "detailed",
								tonality: "persuasive",
								researchPayload: {
									sources: [
										{
											url: "https://example.com/saved",
											title: "Saved source",
											snippet: "Stored with the failed presentation.",
										},
									],
									estimated_tokens: 8.4,
								},
							},
						},
					]}
				>
					<StreamingProvider>
						<Routes>
							<Route path="/generate/research" element={<GenerateResearchPage />} />
						</Routes>
					</StreamingProvider>
				</MemoryRouter>,
			);

			await waitFor(() => expect(view.getByText("Saved source")).toBeInTheDocument());
			expect(view.getAllByText("Stored with the failed presentation.")).not.toHaveLength(0);
			expect(view.getByText("Proceed to Generate").closest("button")).not.toBeDisabled();
			expect(fetchMock).not.toHaveBeenCalled();
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("keeps generation disabled while the research request is loading", async () => {
		const originalFetch = globalThis.fetch;
		let requestCount = 0;
		let resolveResearch: ((response: Response) => void) | undefined;
		let generationBody: Record<string, unknown> | undefined;

		globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
			requestCount += 1;
			if (String(input).includes("/generate-presentation-stream")) {
				generationBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
			}

			return new Promise<Response>((resolve) => {
				resolveResearch = resolve;
			});
		}) as unknown as typeof fetch;

		try {
			const view = render(
				<MemoryRouter
					initialEntries={[
						{
							pathname: "/generate/research",
							state: {
								prompt: "Battery storage market",
								slideCount: 5,
								detailLevel: "balanced",
								tonality: "professional",
								ai: { provider: "google", model: "gemini-2.5-pro" },
							},
						},
					]}
				>
					<StreamingProvider>
						<Routes>
							<Route path="/generate/research" element={<GenerateResearchPage />} />
							<Route path="/presentation" element={<div>Viewer waiting for stream</div>} />
						</Routes>
					</StreamingProvider>
				</MemoryRouter>,
			);

			await waitFor(() => expect(requestCount).toBe(1));
			expect(view.getByText("Proceed to Generate").closest("button")).toBeDisabled();
			expect(view.getByText("Sources")).toBeInTheDocument();

			resolveResearch?.(
				new Response(
					JSON.stringify({
						sources: [
							{
								url: "https://example.com/storage",
								title: "Battery storage outlook",
								snippet: "A complete source preview.",
							},
						],
						estimated_tokens: 5.8,
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				),
			);

			await waitFor(() => {
				expect(view.getByText("Battery storage outlook")).toBeInTheDocument();
			});
			expect(view.getByRole("table", { name: "Research sources" })).toBeInTheDocument();
			expect(view.getAllByText("A complete source preview.")).not.toHaveLength(0);
			const sourceLink = view.getByRole("link", {
				name: "Open source: Battery storage outlook",
			});
			expect(sourceLink).toHaveAttribute("href", "https://example.com/storage");
			expect(sourceLink).toHaveAttribute("target", "_blank");
			expect(view.getByText("Proceed to Generate").closest("button")).not.toBeDisabled();
			expect(view.getByText("Enter").parentElement).toHaveTextContent("Press Enter to generate");

			fireEvent.keyDown(sourceLink, { key: "Enter" });
			expect(requestCount).toBe(1);

			fireEvent.keyDown(window, { key: "Enter" });

			await waitFor(() => expect(requestCount).toBe(2));
			expect(view.getByText("Viewer waiting for stream")).toBeInTheDocument();
			expect(generationBody?.["ai"]).toEqual({
				provider: "google",
				model: "gemini-2.5-pro",
			});
			expect(generationBody?.["research"]).toEqual({ enabled: true });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("keeps research running after leaving the insights page and reuses it on return", async () => {
		const originalFetch = globalThis.fetch;
		let resolveResearch: ((response: Response) => void) | undefined;
		let didAbort = false;

		const fetchMock = mock((_input: RequestInfo | URL, init?: RequestInit) => {
			init?.signal?.addEventListener("abort", () => {
				didAbort = true;
			});

			return new Promise<Response>((resolve) => {
				resolveResearch = resolve;
			});
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		try {
			const view = render(
				<MemoryRouter
					initialEntries={[
						"/presentations",
						{
							pathname: "/generate/research",
							state: {
								prompt: "Grid storage policy",
								slideCount: 6,
								detailLevel: "balanced",
								tonality: "professional",
							},
						},
					]}
					initialIndex={1}
				>
					<StreamingProvider>
						<Routes>
							<Route path="/presentations" element={<AwayPage />} />
							<Route path="/generate/research" element={<GenerateResearchPage />} />
						</Routes>
					</StreamingProvider>
				</MemoryRouter>,
			);

			await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
			fireEvent.click(view.getByRole("button", { name: "Go back" }));
			await waitFor(() => expect(view.getByText("Presentations")).toBeInTheDocument());
			expect(didAbort).toBe(false);

			resolveResearch?.(
				new Response(
					JSON.stringify({
						sources: [
							{
								url: "https://example.com/policy",
								title: "Storage policy update",
								snippet: "The request completed while the page was away.",
							},
						],
						estimated_tokens: 6.2,
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				),
			);

			fireEvent.click(view.getByRole("button", { name: "Return to research" }));

			await waitFor(() => {
				expect(view.getByText("Storage policy update")).toBeInTheDocument();
			});
			expect(view.getAllByText("The request completed while the page was away.")).not.toHaveLength(
				0,
			);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
