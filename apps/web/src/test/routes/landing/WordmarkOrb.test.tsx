import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { WordmarkOrb } from "@/routes/landing/WordmarkOrb";

function renderOrb() {
	return render(
		<MemoryRouter>
			<WordmarkOrb />
		</MemoryRouter>,
	);
}

describe("WordmarkOrb", () => {
	it("is a link that leads to sign-up", () => {
		const { getByRole } = renderOrb();
		const link = getByRole("link", { name: "SlideSage — sign up" });
		expect(link).toHaveAttribute("href", "/sign-up");
	});

	it("layers the star field under the warp streaks under the WebGL orb", () => {
		const { container } = renderOrb();
		expect(container.querySelectorAll("canvas")).toHaveLength(3);
	});

	it("falls back to the flat SVG wordmark when WebGL is unavailable", () => {
		/* happy-dom has no WebGL context, so the effect takes the fallback path
		   and reveals the SVG treatment the hero used before the orb — still
		   linking to sign-up */
		const { container, getByRole } = renderOrb();
		expect(container.querySelector("svg")).not.toBeNull();
		expect(getByRole("link", { name: "SlideSage — sign up" })).toHaveAttribute(
			"href",
			"/sign-up",
		);
	});
});
