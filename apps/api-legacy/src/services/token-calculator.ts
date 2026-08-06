import { estimateMessageInputTokens } from "@slidesage/types";

/*
 * Token Calculator Service
 * Handles token estimation and calculation for presentation generation
 */

export interface TokenCalculationParams {
	slideCount: number;
	detailLevel: string;
	tonality: string;
	researchContext?: string;
}

export interface TokenEstimate {
	estimatedTokens: number;
	baseTokensPerSlide: number;
	detailMultiplier: number;
	tonalityMultiplier: number;
	researchInputTokens: number;
	researchTokenCost: number;
}

// biome-ignore lint/complexity/noStaticOnlyClass: Utility is intentionally static-only.
export class TokenCalculator {
	// Base token cost per slide (in slide tokens)
	private static readonly BASE_TOKEN_PER_SLIDE = 1.0;

	// Adjust based on detail level
	private static readonly DETAIL_MULTIPLIERS: Record<string, number> = {
		brief: 0.6,
		concise: 0.8,
		balanced: 1.0,
		detailed: 2.0,
		comprehensive: 2.5,
	};

	// Minor adjustment for tonality complexity
	private static readonly TONALITY_MULTIPLIERS: Record<string, number> = {
		casual: 0.9,
		professional: 1.0,
		enthusiastic: 1.05,
		persuasive: 1.1,
	};

	/**
	 * Calculate estimated tokens required for presentation generation
	 */
	static calculateEstimatedTokens(params: TokenCalculationParams): TokenEstimate {
		const { slideCount, detailLevel, tonality, researchContext = "" } = params;

		const detailMultiplier = TokenCalculator.DETAIL_MULTIPLIERS[detailLevel] || 1.0;
		const tonalityMultiplier = TokenCalculator.TONALITY_MULTIPLIERS[tonality] || 1.0;
		const baseTokensPerSlide = TokenCalculator.BASE_TOKEN_PER_SLIDE * detailMultiplier;

		const baseEstimatedTokens = slideCount * baseTokensPerSlide * tonalityMultiplier;
		const researchInputTokens = estimateMessageInputTokens(researchContext);
		const researchTokenCost = researchInputTokens / 1000;
		const estimatedTokens = baseEstimatedTokens + researchTokenCost;

		return {
			estimatedTokens: Math.round(estimatedTokens * 10) / 10, // Round to 1 decimal place
			baseTokensPerSlide,
			detailMultiplier,
			tonalityMultiplier,
			researchInputTokens,
			researchTokenCost,
		};
	}

	/**
	 * Calculate actual token deduction based on AI token usage
	 * Legacy system: 1 slide token = 1000 AI tokens
	 */
	static calculateActualTokenDeduction(aiTokensUsed: number): number {
		return aiTokensUsed / 1000.0;
	}

	/**
	 * Get detail level description and cost information
	 */
	static getDetailLevelInfo(detailLevel: string): {
		multiplier: number;
		description: string;
		costFactor: string;
	} {
		const multiplier = TokenCalculator.DETAIL_MULTIPLIERS[detailLevel] || 1.0;

		const descriptions: Record<string, string> = {
			brief: "Minimal content with key highlights only",
			concise: "Essential information in compact form",
			balanced: "Standard level of detail with clear explanations",
			detailed: "Comprehensive information with elaboration",
			comprehensive: "In-depth coverage with extensive details",
		};

		const costFactors: Record<string, string> = {
			brief: "40% less tokens",
			concise: "20% less tokens",
			balanced: "Standard cost",
			detailed: "2x more tokens",
			comprehensive: "2.5x more tokens",
		};

		return {
			multiplier,
			description: descriptions[detailLevel] || descriptions["balanced"] || "",
			costFactor: costFactors[detailLevel] || costFactors["balanced"] || "",
		};
	}

	/**
	 * Get tonality description and cost information
	 */
	static getTonalityInfo(tonality: string): {
		multiplier: number;
		description: string;
		costFactor: string;
	} {
		const multiplier = TokenCalculator.TONALITY_MULTIPLIERS[tonality] || 1.0;

		const descriptions: Record<string, string> = {
			casual: "Relaxed, conversational, and approachable",
			professional: "Business-appropriate, objective, and polished",
			enthusiastic: "Energetic, passionate, and motivational",
			persuasive: "Compelling, benefit-focused, and action-oriented",
		};

		const costFactors: Record<string, string> = {
			casual: "10% less tokens",
			professional: "Standard cost",
			enthusiastic: "5% more tokens",
			persuasive: "10% more tokens",
		};

		return {
			multiplier,
			description: descriptions[tonality] || descriptions["professional"] || "",
			costFactor: costFactors[tonality] || costFactors["professional"] || "",
		};
	}

	/**
	 * Validate if user has sufficient tokens for generation
	 */
	static validateSufficientTokens(
		userTokens: number,
		estimatedTokens: number
	): { sufficient: boolean; shortfall?: number } {
		const sufficient = userTokens >= estimatedTokens;
		return {
			sufficient,
			shortfall: sufficient ? undefined : estimatedTokens - userTokens,
		};
	}

	/**
	 * Calculate daily login bonus
	 */
	static getDailyLoginBonus(): number {
		return 2.0; // 2 slide tokens per day
	}

	/**
	 * Calculate token refund for failed generations
	 */
	static calculateRefund(estimatedTokens: number, actualTokensUsed = 0): number {
		// If generation failed completely, refund all estimated tokens
		if (actualTokensUsed === 0) {
			return estimatedTokens;
		}

		// If generation partially succeeded, refund the difference
		const actualSlideTokens = TokenCalculator.calculateActualTokenDeduction(actualTokensUsed);
		return Math.max(0, estimatedTokens - actualSlideTokens);
	}

	/**
	 * Get token pricing tiers for display
	 */
	static getTokenPricingTiers(): Array<{
		slideCount: number;
		detailLevel: string;
		estimatedTokens: number;
		description: string;
	}> {
		const tiers = [
			{
				slideCount: 5,
				detailLevel: "brief",
				description: "Quick presentation",
			},
			{
				slideCount: 10,
				detailLevel: "balanced",
				description: "Standard presentation",
			},
			{
				slideCount: 15,
				detailLevel: "detailed",
				description: "Comprehensive presentation",
			},
			{
				slideCount: 20,
				detailLevel: "comprehensive",
				description: "Full business deck",
			},
		];

		return tiers.map((tier) => ({
			...tier,
			estimatedTokens: TokenCalculator.calculateEstimatedTokens({
				slideCount: tier.slideCount,
				detailLevel: tier.detailLevel,
				tonality: "professional",
			}).estimatedTokens,
		}));
	}
}
