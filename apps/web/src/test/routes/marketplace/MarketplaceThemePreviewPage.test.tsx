/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

mock.module("@slidesage/ui/components/Viewer/ScaledSlide", () => ({
	ScaledSlide: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

mock.module("@slidesage/ui/components/Viewer/ViewerSlideCarousel", () => ({
	ViewerSlideCarousel: ({ slides }: { slides: unknown[] }) => (
		<div>{`${slides.length} preview slides`}</div>
	),
}));

mock.module("@slidesage/ui/components/Viewer/ViewerNavigationControls", () => ({
	ViewerNavigationControls: () => <div>Viewer navigation</div>,
}));

mock.module("@slidesage/ui/components/Viewer/ViewerThumbnails", () => ({
	ViewerThumbnails: () => <div>Viewer thumbnails</div>,
}));

mock.module("@slidesage/ui/components/Viewer/ViewerFullscreenOverlayControls", () => ({
	ViewerFullscreenOverlayControls: () => <div>Fullscreen controls</div>,
}));

mock.module("@slidesage/ui/components/Viewer/SlideRenderer", () => ({
	SlideRenderer: ({
		slide,
		currentTemplate,
	}: {
		slide: { title: string };
		currentTemplate: string;
	}) => <div>{`${slide.title}|${currentTemplate}`}</div>,
}));

mock.module("@/hooks/useFullscreenMode", () => ({
	useFullscreenMode: () => ({
		isFullscreenMode: false,
		enter: mock(),
		exit: mock(),
	}),
}));

describe("MarketplaceThemePreviewPage", () => {
	it("renders the selected SlideSage offering without viewer editing controls", async () => {
		const { default: MarketplaceThemePreviewPage } = await import(
			"@/routes/marketplace/MarketplaceThemePreviewPage"
		);
		const view = render(
			<MemoryRouter initialEntries={["/marketplace/neon-district/preview"]}>
				<Routes>
					<Route
						path="/marketplace/:marketplaceId/preview"
						element={<MarketplaceThemePreviewPage />}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(view.getByText("7 preview slides")).toBeInTheDocument();
		expect(view.getByText("Viewer navigation")).toBeInTheDocument();
		expect(view.getByText("Viewer thumbnails")).toBeInTheDocument();
		expect(view.getByText("Neon District")).toBeInTheDocument();
		expect(view.queryByRole("button", { name: "Iterate" })).toBeNull();
		expect(view.queryByRole("combobox")).toBeNull();
		expect(view.getByRole("button", { name: "Present slideshow" })).toBeInTheDocument();
	});

	it("redirects unknown themes to the marketplace", async () => {
		const { default: MarketplaceThemePreviewPage } = await import(
			"@/routes/marketplace/MarketplaceThemePreviewPage"
		);
		const view = render(
			<MemoryRouter initialEntries={["/marketplace/unknown/preview"]}>
				<Routes>
					<Route
						path="/marketplace/:marketplaceId/preview"
						element={<MarketplaceThemePreviewPage />}
					/>
					<Route path="/marketplace" element={<div>Marketplace catalog</div>} />
				</Routes>
			</MemoryRouter>,
		);

		expect(view.getByText("Marketplace catalog")).toBeInTheDocument();
	});
});
