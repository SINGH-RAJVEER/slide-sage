/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { StreamingProvider } from "@slidesage/ui";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PresentationViewerPage from "@/routes/presentations/PresentationViewer";

function contentSlide(id: string) {
	return {
		id,
		type: "content",
		layout: "body",
		title: "Quarter in review",
		subtitle: "Operating highlights",
		tone: "default",
		density: "standard",
		pattern: "none",
		blocks: [
			{
				id: `${id}-block-1`,
				type: "paragraph",
				region: "main",
				text: "Revenue grew while costs held flat.",
				emphasis: "standard",
				treatment: "plain",
				sourceIds: [],
			},
		],
		transition: { type: "none", durationMs: 0 },
		effects: [],
	};
}

function presentationResponse(
	theme: string,
	template = { id: "soft-skills-training", version: 1 },
) {
	return Response.json({
		presentation: {
			id: "presentation_1",
			title: "Quarterly Review",
			slides_data: {
				title: "Quarterly Review",
				theme,
				template,
				dimensions: { width: 1280, height: 720 },
				slides: [contentSlide("slide-1")],
				totalSlides: 1,
			},
		},
	});
}

function renderViewer() {
	return render(
		<StreamingProvider>
			<MemoryRouter initialEntries={["/presentations/presentation_1"]}>
				<Routes>
					<Route path="/presentations/:presentationId" element={<PresentationViewerPage />} />
					<Route path="/" element={<div>Home</div>} />
					<Route path="/presentations" element={<div>Presentations grid</div>} />
					<Route path="/presentation-error" element={<div>Presentation error</div>} />
				</Routes>
			</MemoryRouter>
		</StreamingProvider>,
	);
}

it("opens a saved presentation with its binary template", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = mock(async () =>
		presentationResponse("terra-mesa"),
	) as unknown as typeof fetch;

	try {
		const view = renderViewer();

		await waitFor(() => {
			expect(view.getByRole("button", { name: /Soft Skills Training/ })).toBeInTheDocument();
		});
		expect(
			view.queryByRole("button", { name: /Simple Business Proposal/ }),
		).not.toBeInTheDocument();
	} finally {
		globalThis.fetch = originalFetch;
	}
});

it("saves a template and preview theme in one mutation", async () => {
	const originalFetch = globalThis.fetch;
	let savedTheme = "";
	let savedTemplate: { id: string; version: number } | undefined;
	globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
		if (init?.method === "PATCH") {
			const body = JSON.parse(String(init.body)) as {
				mutations: Array<{
					type: string;
					theme?: string;
					template?: { id: string; version: number };
				}>;
			};
			const mutation = body.mutations.find((candidate) => candidate.type === "update-presentation");
			savedTheme = mutation?.theme as string;
			savedTemplate = mutation?.template;
			return presentationResponse(savedTheme, savedTemplate);
		}
		return presentationResponse("terra-mesa");
	}) as unknown as typeof fetch;

	try {
		const view = renderViewer();
		await waitFor(() => {
			expect(view.getByRole("button", { name: /Soft Skills Training/ })).toBeInTheDocument();
		});

		fireEvent.pointerDown(view.getByRole("button", { name: /Soft Skills Training/ }), {
			button: 0,
			ctrlKey: false,
		});
		fireEvent.click(
			view.getByRole("menuitem", { name: /Modern Minimal Grid Financial Management/ }),
		);

		await waitFor(() => expect(savedTheme).toBe("modern-dark"));
		expect(savedTemplate).toEqual({
			id: "modern-minimal-grid-financial-management",
			version: 1,
		});
		await waitFor(() => {
			expect(
				view.getByRole("button", { name: /Modern Minimal Grid Financial Management/ }),
			).toBeInTheDocument();
		});
		expect(view.queryByRole("button", { name: /Soft Skills Training/ })).not.toBeInTheDocument();
	} finally {
		globalThis.fetch = originalFetch;
	}
});
