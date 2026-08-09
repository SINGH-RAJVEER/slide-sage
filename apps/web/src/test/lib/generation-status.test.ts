import { describe, expect, it } from "bun:test";
import { getGenerationDisplayStatus } from "@/lib/generation-status";

describe("generation display status", () => {
	it("prefers pipeline stage messages and progress", () => {
		expect(
			getGenerationDisplayStatus({
				slides: [],
				requestedSlides: 5,
				generationMessage: "Preparing presentation",
				generationProgress: { completed: 1, total: 4 },
			}),
		).toEqual({ message: "Preparing presentation", progress: 0.25 });
	});

	it("uses research and slide progress fallbacks before stages arrive", () => {
		expect(
			getGenerationDisplayStatus({
				slides: [{}, {}],
				requestedSlides: 5,
				researchStatus: "searching",
			}),
		).toEqual({ message: "Finding relevant sources", progress: 0.4 });
	});
});
