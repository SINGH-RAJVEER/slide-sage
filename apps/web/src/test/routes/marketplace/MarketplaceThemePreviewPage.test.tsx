/// <reference lib="dom" />
import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MarketplaceThemePreviewPage from "../../../routes/marketplace/MarketplaceThemePreviewPage";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
const digest = "a".repeat(64);
function viewTheme(id = "charli-xcx-brat-album-inspired") {
	return render(
		<MemoryRouter initialEntries={[`/marketplace/${id}/preview`]}>
			<Routes>
				<Route
					path="/marketplace/:marketplaceId/preview"
					element={<MarketplaceThemePreviewPage />}
				/>
				<Route path="/marketplace" element={<div>Marketplace catalog</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("MarketplaceThemePreviewPage", () => {
	it("loads all CDN template slides with navigation and presentation mode", async () => {
		const requests: string[] = [];
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			requests.push(String(input));
			return Response.json({ slideCount: 3, sha256: digest });
		}) as unknown as typeof fetch;
		const view = viewTheme();
		expect(await view.findByText("Slide 1 of 3")).toBeInTheDocument();
		expect(requests).toHaveLength(1);
		expect(requests[0]).toContain("/template-previews/charli-xcx-brat-album-inspired/1");
		expect(view.getAllByRole("img", { name: "Slide 3" })[0]?.getAttribute("src")).toContain(
			`/${digest}/2`,
		);
		fireEvent.click(view.getByRole("button", { name: "Next slide" }));
		expect(await view.findByText("Slide 2 of 3")).toBeInTheDocument();
		fireEvent.click(view.getByRole("button", { name: "Go to slide 3" }));
		expect(await view.findByText("Slide 3 of 3")).toBeInTheDocument();
		fireEvent.click(view.getByRole("button", { name: "Present slideshow" }));
		expect(await view.findByRole("button", { name: "Exit presentation" })).toBeInTheDocument();
		expect(view.getAllByRole("img")).toHaveLength(1);
		fireEvent.keyDown(window, { key: "Escape" });
		await waitFor(() =>
			expect(view.queryByRole("button", { name: "Exit presentation" })).toBeNull(),
		);
	});
	it("reports CDN failures and retries without using a cover-only fallback", async () => {
		let calls = 0;
		globalThis.fetch = (async () =>
			++calls === 1
				? new Response("Unavailable", { status: 502 })
				: Response.json({ slideCount: 2, sha256: digest })) as unknown as typeof fetch;
		const view = viewTheme();
		expect(await view.findByRole("alert")).toHaveTextContent("Could not load the template slides");
		expect(view.queryAllByRole("img")).toHaveLength(0);
		fireEvent.click(view.getByRole("button", { name: "Retry" }));
		expect(await view.findByText("Slide 1 of 2")).toBeInTheDocument();
	});
	it("redirects unknown themes without fetching", async () => {
		globalThis.fetch = (() => {
			throw new Error("unexpected fetch");
		}) as unknown as typeof fetch;
		expect(await viewTheme("not-a-template").findByText("Marketplace catalog")).toBeInTheDocument();
	});
});
