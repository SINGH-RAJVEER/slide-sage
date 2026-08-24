import { describe, expect, it, mock } from "bun:test";
import { getTemplate } from "@slidesage/ui/lib/templates";
import { fireEvent, render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LANDING_PLATES } from "@/routes/landing/slide-examples";

mock.module("@slidesage/ui", () => ({
	useAuth: () => ({ isSignedIn: false, loading: false }),
	LoadingScreen: ({ label }: { label: string }) => <div>{label}</div>,
}));

mock.module("@slidesage/ui/components/Viewer/SlideRenderer", () => ({
	SlideRenderer: ({ slide }: { slide: { title?: string } }) => (
		<div data-testid="slide-preview">{slide.title}</div>
	),
}));

mock.module("@slidesage/ui/components/Viewer/ScaledSlide", () => ({
	ScaledSlide: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("LandingPage", () => {
	it("renders only the ring hero, with no header or copy sections", async () => {
		const { default: LandingPage } = await import("@/routes/landing/LandingPage");

		const { getByRole, queryByRole, container } = render(
			<MemoryRouter>
				<LandingPage />
			</MemoryRouter>,
		);

		expect(
			getByRole("img", {
				name: "Slides from finished decks orbiting the SlideSage wordmark",
			}),
		).toBeInTheDocument();
		expect(queryByRole("banner")).not.toBeInTheDocument();
		expect(queryByRole("contentinfo")).not.toBeInTheDocument();
		/* the sphere is the page's single call to action */
		expect(getByRole("link", { name: "SlideSage — sign up" })).toHaveAttribute("href", "/sign-up");
		expect(container.querySelectorAll("h1, h2, p")).toHaveLength(0);
	});

	it("renders every plate through the slide renderer", async () => {
		const { default: LandingPage } = await import("@/routes/landing/LandingPage");

		const { getAllByTestId, getByRole } = render(
			<MemoryRouter>
				<LandingPage />
			</MemoryRouter>,
		);

		expect(getAllByTestId("slide-preview")).toHaveLength(LANDING_PLATES.length);
		expect(getByRole("link", { name: "SlideSage — sign up" })).toHaveAttribute("href", "/sign-up");
	});

	it("opens a hovering preview when a plate is clicked, and closes on Escape", async () => {
		const { default: LandingPage } = await import("@/routes/landing/LandingPage");

		const { getByRole, queryByRole } = render(
			<MemoryRouter>
				<LandingPage />
			</MemoryRouter>,
		);

		const index = LANDING_PLATES.findIndex((plate) => plate.slide.type === "content");
		const plate = document.querySelector(`[data-plate-index="${index}"]`);
		expect(plate).not.toBeNull();

		fireEvent.pointerDown(plate as Element);
		fireEvent.pointerUp(window);

		const dialog = getByRole("dialog");
		expect(dialog).toBeInTheDocument();
		const slide = LANDING_PLATES[index]?.slide;
		if (slide?.type === "content") {
			expect(within(dialog).getByText(slide.title)).toBeInTheDocument();
		}
		/* the only button in the preview is the backdrop; there is no close X */
		expect(within(dialog).getAllByRole("button")).toHaveLength(1);

		fireEvent.click(within(dialog).getByRole("button"));
		expect(queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("throws the ring on drag without opening the preview", async () => {
		const { default: LandingPage } = await import("@/routes/landing/LandingPage");

		const { queryByRole } = render(
			<MemoryRouter>
				<LandingPage />
			</MemoryRouter>,
		);

		const plate = document.querySelector('[data-plate-index="0"]');
		expect(plate).not.toBeNull();

		fireEvent.pointerDown(plate as Element, { clientX: 100, clientY: 100 });
		fireEvent.pointerMove(window, { clientX: 160, clientY: 100 });
		fireEvent.pointerMove(window, { clientX: 220, clientY: 100 });
		fireEvent.pointerUp(window, { clientX: 220, clientY: 100 });

		/* a throw, not a tap: the ring spins on and no preview opens */
		expect(queryByRole("dialog")).not.toBeInTheDocument();
	});
});

describe("EntranceRoute", () => {
	it("shows the landing page to anonymous visitors", async () => {
		const { default: EntranceRoute } = await import("@/app/router/EntranceRoute");

		const { getByRole } = render(
			<MemoryRouter>
				<EntranceRoute />
			</MemoryRouter>,
		);
		expect(
			getByRole("img", {
				name: "Slides from finished decks orbiting the SlideSage wordmark",
			}),
		).toBeInTheDocument();
	});
});

describe("Landing plates", () => {
	it("draws from built-in and marketplace themes with unique ids", () => {
		expect(LANDING_PLATES.length).toBeGreaterThanOrEqual(12);
		const ids = new Set(LANDING_PLATES.map((plate) => plate.id));
		expect(ids.size).toBe(LANDING_PLATES.length);
		const themeIds = new Set(LANDING_PLATES.map((plate) => plate.themeId));
		expect(themeIds.has("modern-dark")).toBe(true);
		expect(themeIds.has("neon-district")).toBe(true);
		expect(themeIds.has("velvet-marquee")).toBe(true);
		expect(themeIds.has("bubblegum-pop")).toBe(true);
		for (const plate of LANDING_PLATES) {
			expect(getTemplate(plate.themeId)).toBeDefined();
			expect(["content", "chart"]).toContain(plate.slide.type);
		}
	});

	it("never places two slides from one theme side by side on the ring", () => {
		for (let i = 1; i < LANDING_PLATES.length; i++) {
			const current = LANDING_PLATES[i];
			const previous = LANDING_PLATES[i - 1];
			expect(current?.themeId).not.toBe(previous?.themeId);
		}
		/* the ring wraps, so the last plate must also differ from the first */
		const first = LANDING_PLATES[0];
		const last = LANDING_PLATES[LANDING_PLATES.length - 1];
		expect(first?.themeId).not.toBe(last?.themeId);
	});

	it("mixes quotes, charts, tables, and comparisons into the ring", () => {
		const slides = LANDING_PLATES.map((plate) => plate.slide);
		const chartTypes = new Set(
			slides.filter((s) => s.type === "chart").map((s) => s.chartConfig.type),
		);
		expect(chartTypes.size).toBeGreaterThanOrEqual(3);
		const blocks = slides.flatMap((s) => (s.type === "content" ? s.blocks : []));
		expect(blocks.some((block) => block.type === "quote")).toBe(true);
		expect(blocks.some((block) => block.type === "table")).toBe(true);
		expect(slides.some((s) => s.type === "content" && s.layout === "comparison")).toBe(true);
		expect(slides.some((s) => s.type === "content" && s.layout === "quote")).toBe(true);
	});

	it("keeps plain heading pages rare and pairs every other plate with content", () => {
		const content = LANDING_PLATES.flatMap((plate) =>
			plate.slide.type === "content" ? [plate.slide] : [],
		);
		const covers = content.filter((s) => s.layout === "cover");
		expect(covers.length).toBeLessThanOrEqual(2);
		/* every non-cover plate carries at least one content block */
		for (const slide of content) {
			if (slide.layout === "cover") continue;
			const hasBackground = Boolean(slide.backgroundImage);
			expect(hasBackground || slide.blocks.length > 0).toBe(true);
		}
	});

	it("spreads image-plus-text permutations across the ring", () => {
		const blocks = LANDING_PLATES.flatMap((plate) =>
			plate.slide.type === "content" ? plate.slide.blocks : [],
		);
		const images = blocks.filter((block) => block.type === "image");
		expect(images.length).toBeGreaterThanOrEqual(5);
		for (const image of images) {
			if (image.type !== "image") continue;
			expect(image.url).toMatch(/^https:/);
			expect(image.alt.length).toBeGreaterThan(0);
		}
		const mediaLayouts = LANDING_PLATES.filter(
			(plate) =>
				plate.slide.type === "content" &&
				(plate.slide.layout === "media-left" || plate.slide.layout === "media-right"),
		);
		expect(mediaLayouts.length).toBeGreaterThanOrEqual(5);
	});

	it("brings live animations: drawing charts and counting stats beside text", () => {
		const content = LANDING_PLATES.flatMap((plate) =>
			plate.slide.type === "content" ? [plate.slide] : [],
		);
		/* embedded chart blocks animate their draw-in */
		const chartBlocks = content.flatMap((slide) =>
			slide.blocks.filter((block) => block.type === "chart"),
		);
		expect(chartBlocks.length).toBeGreaterThanOrEqual(1);
		/* stat values are numeric so they count up when the plate goes live */
		const statValues = content
			.flatMap((slide) => slide.blocks.filter((block) => block.type === "stats"))
			.flatMap((block) => (block.type === "stats" ? block.items : []))
			.map((item) => item.value);
		expect(statValues.length).toBeGreaterThanOrEqual(8);
		expect(statValues.some((value) => /\d/.test(value))).toBe(true);
		/* generated diagrams render beside prose */
		const widgets = content.flatMap((slide) =>
			slide.blocks.filter((block) => block.type === "widget"),
		);
		expect(widgets.length).toBeGreaterThanOrEqual(2);
	});
});
