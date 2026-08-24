import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

mock.module("@designcodeio/threeui", () => ({
	GalleryHeading: ({ variant }: { variant?: string }) => (
		<div data-testid="gallery-heading" data-variant={variant} />
	),
}));

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
	it("renders the hero, tagline, and one theme gallery per tab", async () => {
		const { default: LandingPage } = await import("@/routes/landing/LandingPage");

		const { getByTestId, getByRole, getAllByRole, getByText } = render(
			<MemoryRouter>
				<LandingPage />
			</MemoryRouter>,
		);

		expect(getByTestId("gallery-heading")).toBeInTheDocument();
		expect(getByTestId("gallery-heading").dataset["variant"]).toBe("rising-diagonal");
		expect(getByText("One prompt in. A finished deck out.")).toBeInTheDocument();

		const tabs = getAllByRole("tab");
		expect(tabs).toHaveLength(4);
		expect(tabs[0]).toHaveTextContent("Midnight Terminal");
		expect(getByRole("tab", { name: "Concrete Brutal" })).toBeInTheDocument();
	});

	it("shows the first sample slide and switches galleries from the tabs", async () => {
		const { default: LandingPage } = await import("@/routes/landing/LandingPage");

		const { getByTestId, getByRole, getByText } = render(
			<MemoryRouter>
				<LandingPage />
			</MemoryRouter>,
		);

		expect(getByTestId("slide-preview")).toHaveTextContent("Ship the roadmap after dark");

		fireEvent.click(getByRole("tab", { name: "Terra Mesa" }));

		expect(getByRole("tab", { name: "Terra Mesa" }).getAttribute("aria-selected")).toBe("true");
		expect(getByTestId("gallery-heading").dataset["variant"]).toBe("horizontal-sweep");
		expect(getByTestId("slide-preview")).toHaveTextContent("Let the place tell the story");
		expect(getByText("Theme 03 of 4")).toBeInTheDocument();
	});

	it("advances to the next slide with the next control", async () => {
		const { default: LandingPage } = await import("@/routes/landing/LandingPage");

		const { getByTestId, getByRole } = render(
			<MemoryRouter>
				<LandingPage />
			</MemoryRouter>,
		);

		fireEvent.click(getByRole("button", { name: "Next slide" }));

		expect(getByTestId("slide-preview")).toHaveTextContent("Three bets carry the quarter");
	});
});

describe("EntranceRoute", () => {
	it("shows the landing page to anonymous visitors", async () => {
		const { default: EntranceRoute } = await import("@/app/router/EntranceRoute");

		const { getByText } = render(
			<MemoryRouter>
				<EntranceRoute />
			</MemoryRouter>,
		);

		expect(getByText("One prompt in. A finished deck out.")).toBeInTheDocument();
	});
});
