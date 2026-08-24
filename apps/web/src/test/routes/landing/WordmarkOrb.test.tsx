import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { WordmarkOrb } from "@/routes/landing/WordmarkOrb";

describe("WordmarkOrb", () => {
	it("labels itself as the SlideSage image for the ring's accessible name", () => {
		const { getByRole } = render(<WordmarkOrb />);
		expect(getByRole("img", { name: "SlideSage" })).toBeInTheDocument();
	});

	it("layers the star field under the warp streaks under the WebGL orb", () => {
		const { container } = render(<WordmarkOrb />);
		expect(container.querySelectorAll("canvas")).toHaveLength(3);
	});

	it("falls back to the flat SVG wordmark when WebGL is unavailable", () => {
		/* happy-dom has no WebGL context, so the effect takes the fallback path
		   and reveals the SVG treatment the hero used before the orb */
		const { container } = render(<WordmarkOrb />);
		expect(container.querySelector("svg")).not.toBeNull();
		const fallback = container.querySelector("div[aria-hidden='true']");
		expect(fallback).not.toBeNull();
	});
});
