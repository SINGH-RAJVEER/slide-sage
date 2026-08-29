/// <reference lib="dom" />

import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { ActiveGenerationIndicator } from "@slidesage/ui/components/StatusIndicator/ActiveGenerationIndicator";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { StreamingProvider, useStreaming } from "@/modules/contexts/StreamingContext";

beforeEach(() => localStorage.removeItem("slidesage-active-generation"));
afterEach(() => localStorage.removeItem("slidesage-active-generation"));

function Starter() {
	const { generate } = useStreaming();
	return (
		<button
			type="button"
			onClick={() => {
				void generate({
					prompt: "solar policy deck",
					slideCount: 1,
					detailLevel: "brief",
					tonality: "casual",
				});
			}}
		>
			Start
		</button>
	);
}

it("is hidden while no generation runs", () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = mock(async () => new Response("", { status: 200 })) as unknown as typeof fetch;
	try {
		const onOpen = mock(() => {});
		const view = render(
			<StreamingProvider>
				<ActiveGenerationIndicator onOpen={onOpen} />
			</StreamingProvider>,
		);
		expect(view.container.querySelector("button")).toBeNull();
	} finally {
		globalThis.fetch = originalFetch;
	}
});

it("shows a running generation and opens it, even after navigating away", async () => {
	const originalFetch = globalThis.fetch;
	let events = 0;
	globalThis.fetch = mock(async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.endsWith("/presentation-jobs")) {
			return Response.json({ job_id: "job_1", presentation_id: "pres_9" }, { status: 202 });
		}
		events += 1;
		if (events === 1) {
			return new Response(
				'id: 1\\nevent: stage\\ndata: {"stage":"planning","message":"Preparing","completed":1,"total":3}\\n\\n',
				{ status: 200, headers: { "Content-Type": "text/event-stream" } },
			);
		}
		return new Response("", { status: 200 });
	}) as unknown as typeof fetch;

	const onOpen = mock(() => {});
	try {
		const view = render(
			<StreamingProvider>
				<Starter />
				<ActiveGenerationIndicator onOpen={onOpen} />
			</StreamingProvider>,
		);

		fireEvent.click(view.getByRole("button", { name: "Start" }));

		await waitFor(() => {
			expect(
				view.getByRole("button", { name: "solar policy deck is generating. Open it" }),
			).toBeInTheDocument();
		});
		const pill = view.getByRole("button", {
			name: "solar policy deck is generating. Open it",
		});
		expect(view.getByText("solar policy deck")).toBeInTheDocument();
		expect(pill).toHaveClass("hover:w-fit", "focus-visible:w-fit");
		fireEvent.click(pill);
		expect(onOpen).toHaveBeenCalledWith("pres_9");
	} finally {
		globalThis.fetch = originalFetch;
	}
});
