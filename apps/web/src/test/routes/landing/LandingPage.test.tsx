import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LANDING_PLATE_COUNT, randomLandingPlates } from "../../../routes/landing/landing-plates";

const RING_LABEL = "Presentation templates orbiting the SlideSage wordmark";

const authState: { isSignedIn: boolean; loading: boolean; user: { landingPage?: string } | null } =
	{
		isSignedIn: false,
		loading: false,
		user: null,
	};

mock.module("@slidesage/ui", () => ({
	useAuth: () => authState,
	LoadingScreen: ({ label }: { label: string }) => <div>{label}</div>,
}));

describe("LandingPage", () => {
	it("renders only the ring hero, with no header or copy sections", async () => {
		const { default: LandingPage } = await import("../../../routes/landing/LandingPage");

		const { getByRole, queryByRole, container } = render(
			<MemoryRouter>
				<LandingPage />
			</MemoryRouter>,
		);

		expect(getByRole("img", { name: RING_LABEL })).toBeInTheDocument();
		expect(queryByRole("banner")).not.toBeInTheDocument();
		expect(queryByRole("contentinfo")).not.toBeInTheDocument();
		/* the sphere is the page's single call to action */
		expect(getByRole("link", { name: "SlideSage — sign up" })).toHaveAttribute("href", "/sign-up");
		expect(container.querySelectorAll("h1, h2, p")).toHaveLength(0);
	});

	it("renders one CDN thumbnail per plate", async () => {
		const { default: LandingPage } = await import("../../../routes/landing/LandingPage");

		const { container } = render(
			<MemoryRouter>
				<LandingPage />
			</MemoryRouter>,
		);

		const plates = container.querySelectorAll("[data-plate-index] img");
		expect(plates.length).toBe(randomLandingPlates().length);
		for (const plate of plates) {
			expect(plate.getAttribute("src")).toContain("/template-thumbnails/");
		}
	});

	it("opens a hovering preview when a plate is clicked, and closes on Escape", async () => {
		const { default: LandingPage } = await import("../../../routes/landing/LandingPage");

		const { getByRole, queryByRole } = render(
			<MemoryRouter>
				<LandingPage />
			</MemoryRouter>,
		);

		const plate = document.querySelector('[data-plate-index="0"]');
		expect(plate).not.toBeNull();

		fireEvent.pointerDown(plate as Element, { clientX: 100, clientY: 100 });
		fireEvent.pointerUp(window, { clientX: 100, clientY: 100 });

		expect(getByRole("dialog")).toBeInTheDocument();

		fireEvent.keyDown(window, { key: "Escape" });
		expect(queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("throws the ring on drag without opening the preview", async () => {
		const { default: LandingPage } = await import("../../../routes/landing/LandingPage");

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

describe("Landing plates", () => {
	it("draws published sixteen-by-nine templates from the catalog", () => {
		const plates = randomLandingPlates();

		expect(plates.length).toBeGreaterThan(0);
		expect(plates.length).toBeLessThanOrEqual(LANDING_PLATE_COUNT);
		for (const plate of plates) {
			expect(plate.thumbnailUrl).toContain(encodeURIComponent(`pptx-templates/${plate.id}/1/`));
			expect(plate.name.length).toBeGreaterThan(0);
		}
	});

	it("never repeats a template within one ring", () => {
		const ids = randomLandingPlates().map((plate) => plate.id);

		expect(new Set(ids).size).toBe(ids.length);
	});

	it("samples a different ring per visit", () => {
		/* a pinned generator proves the order follows the randomiser rather
		   than the catalog's own order */
		let seed = 0;
		const pinned = randomLandingPlates(LANDING_PLATE_COUNT, () => {
			seed += 0.37;
			return seed % 1;
		});
		const catalogOrder = randomLandingPlates(LANDING_PLATE_COUNT, () => 0);

		expect(pinned.map((plate) => plate.id)).not.toEqual(catalogOrder.map((plate) => plate.id));
	});
});

describe("EntranceRoute", () => {
	it("shows the landing page to anonymous visitors", async () => {
		authState.isSignedIn = false;
		authState.user = null;
		const { default: EntranceRoute } = await import("../../../app/router/EntranceRoute");

		const { getByRole } = render(
			<MemoryRouter>
				<EntranceRoute />
			</MemoryRouter>,
		);

		expect(getByRole("img", { name: RING_LABEL })).toBeInTheDocument();
	});

	it("keeps a signed-in visitor on the landing page when that is their default", async () => {
		authState.isSignedIn = true;
		authState.user = { landingPage: "landing" };
		const { default: EntranceRoute } = await import("../../../app/router/EntranceRoute");

		const { getByRole } = render(
			<MemoryRouter>
				<EntranceRoute />
			</MemoryRouter>,
		);

		expect(getByRole("img", { name: RING_LABEL })).toBeInTheDocument();
	});

	it("forwards a signed-in visitor whose default is an app page", async () => {
		authState.isSignedIn = true;
		authState.user = { landingPage: "generate" };
		const { default: EntranceRoute } = await import("../../../app/router/EntranceRoute");

		const { queryByRole } = render(
			<MemoryRouter>
				<EntranceRoute />
			</MemoryRouter>,
		);

		expect(queryByRole("img", { name: RING_LABEL })).not.toBeInTheDocument();
	});
});
