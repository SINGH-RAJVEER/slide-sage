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

function presentationResponse(theme: string) {
	return Response.json({
		presentation: {
			id: "presentation_1",
			title: "Quarterly Review",
			slides_data: {
				title: "Quarterly Review",
				theme,
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

it("opens a saved presentation in the theme it was last viewed with", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = mock(async () =>
		presentationResponse("elegant-serif"),
	) as unknown as typeof fetch;

	try {
		const view = renderViewer();

		await waitFor(() => {
			expect(view.getByRole("button", { name: /Editorial Ledger/ })).toBeInTheDocument();
		});
		expect(view.queryByRole("button", { name: /Signal Grid/ })).not.toBeInTheDocument();
	} finally {
		globalThis.fetch = originalFetch;
	}
});

it("saves a theme change to the stored document and keeps it afterwards", async () => {
	const originalFetch = globalThis.fetch;
	let savedTheme = "";
	globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
		if (init?.method === "PATCH") {
			const body = JSON.parse(String(init.body)) as {
				mutations: Array<{ type: string; theme?: string }>;
			};
			savedTheme = body.mutations.find((mutation) => mutation.type === "update-presentation")
				?.theme as string;
			return presentationResponse(savedTheme);
		}
		return presentationResponse("elegant-serif");
	}) as unknown as typeof fetch;

	try {
		const view = renderViewer();
		await waitFor(() => {
			expect(view.getByRole("button", { name: /Editorial Ledger/ })).toBeInTheDocument();
		});

		fireEvent.pointerDown(view.getByRole("button", { name: /Editorial Ledger/ }), {
			button: 0,
			ctrlKey: false,
		});
		fireEvent.click(view.getByRole("menuitem", { name: /Midnight Terminal/ }));

		await waitFor(() => expect(savedTheme).toBe("modern-dark"));
		await waitFor(() => {
			expect(view.getByRole("button", { name: /Midnight Terminal/ })).toBeInTheDocument();
		});
		expect(view.queryByRole("button", { name: /Signal Grid/ })).not.toBeInTheDocument();
	} finally {
		globalThis.fetch = originalFetch;
	}
});
