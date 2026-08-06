import { describe, expect, it } from "bun:test";
import { buildResearchSystemMessage, estimateMessageInputTokens } from "@slidesage/types";
import { TokenCalculator } from "./token-calculator";

describe("TokenCalculator research estimates", () => {
	it("adds the serialized research input cost to the slide estimate", () => {
		const researchContext = buildResearchSystemMessage(
			[
				{
					url: "https://example.com/report",
					title: "Market report",
					summary: "Demand increased by 18 percent year over year.",
					highlights: ["Growth was strongest in Asia."],
				},
			],
			"Battery storage market"
		);
		const researchInputTokens = estimateMessageInputTokens(researchContext);

		const estimate = TokenCalculator.calculateEstimatedTokens({
			slideCount: 5,
			detailLevel: "balanced",
			tonality: "professional",
			researchContext,
		});

		expect(estimate.researchInputTokens).toBe(researchInputTokens);
		expect(estimate.researchTokenCost).toBe(researchInputTokens / 1000);
		expect(estimate.estimatedTokens).toBe(Math.round((5 + researchInputTokens / 1000) * 10) / 10);
	});

	it("does not add research cost when no context is sent", () => {
		const estimate = TokenCalculator.calculateEstimatedTokens({
			slideCount: 5,
			detailLevel: "balanced",
			tonality: "professional",
		});

		expect(estimate.estimatedTokens).toBe(5);
		expect(estimate.researchInputTokens).toBe(0);
		expect(estimate.researchTokenCost).toBe(0);
	});
});

describe("TokenCalculator actual usage", () => {
	it("converts provider tokens to slide tokens", () => {
		expect(TokenCalculator.calculateActualTokenDeduction(0)).toBe(0);
		expect(TokenCalculator.calculateActualTokenDeduction(2500)).toBe(2.5);
	});
});
