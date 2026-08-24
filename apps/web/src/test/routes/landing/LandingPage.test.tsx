import { describe, expect, it, mock } from "bun:test";
import { getTemplate } from "@slidesage/ui/lib/templates";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SLIDE_EXAMPLES } from "@/routes/landing/slide-examples";

mock.module("@slidesage/ui", () => ({
	useAuth: () => ({ isSignedIn: false, loading: false }),
	LoadingScreen: ({ label }: { label: string }) => <div>{label}</div>,
}));

describe("LandingPage", () => {
	it("renders the ring hero, tagline, and sign-up call to action", async () => {
		const { default: LandingPage } = await import("@/routes/landing/LandingPage");

		const { getByRole, getByText } = render(
			<MemoryRouter>
				<LandingPage />
			</MemoryRouter>,
		);

		expect(
			getByRole("img", {
				name: "Static slides from finished decks orbiting the SlideSage wordmark",
			}),
		).toBeInTheDocument();
		expect(getByText("One prompt in. A finished deck out.")).toBeInTheDocument();
		expect(getByRole("link", { name: "Start generating" }).getAttribute("href")).toBe("/sign-up");
		expect(getByRole("link", { name: "Create your first deck" }).getAttribute("href")).toBe(
			"/sign-up",
		);
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

describe("Slide examples", () => {
	it("provides a full ring of unique, resolvable theme plates", () => {
		expect(SLIDE_EXAMPLES.length).toBeGreaterThanOrEqual(12);
		const ids = new Set(SLIDE_EXAMPLES.map((example) => example.id));
		expect(ids.size).toBe(SLIDE_EXAMPLES.length);
		for (const example of SLIDE_EXAMPLES) {
			expect(getTemplate(example.themeId)).toBeDefined();
			expect(example.title.length).toBeGreaterThan(0);
		}
	});
});
