/*
 * Token Calculator Service
 * Handles token estimation and calculation for presentation generation
 */

export interface TokenCalculationParams {
    slideCount: number;
    detailLevel: string;
    tonality: string;
}

export interface SearchTokenEstimateParams {
    query: string;
    maxResults?: number;
    includeSummarization?: boolean;
    summarizationMaxOutputTokens?: number;
}

export interface TokenEstimate {
    estimatedTokens: number;
    baseTokensPerSlide: number;
    detailMultiplier: number;
    tonalityMultiplier: number;
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
        const { slideCount, detailLevel, tonality } = params;

        const detailMultiplier = TokenCalculator.DETAIL_MULTIPLIERS[detailLevel] || 1.0;
        const tonalityMultiplier = TokenCalculator.TONALITY_MULTIPLIERS[tonality] || 1.0;
        const baseTokensPerSlide = TokenCalculator.BASE_TOKEN_PER_SLIDE * detailMultiplier;

        // Calculate total estimated tokens
        const estimatedTokens = slideCount * baseTokensPerSlide * tonalityMultiplier;

        return {
            estimatedTokens: Math.round(estimatedTokens * 10) / 10, // Round to 1 decimal place
            baseTokensPerSlide,
            detailMultiplier,
            tonalityMultiplier,
        };
    }

    /**
     * Rough token estimator for plain text.
     * Heuristic: ~4 chars/token (English-ish).
     */
    static estimateTokensForText(text: string): number {
        const value = typeof text === "string" ? text : String(text ?? "");
        const trimmed = value.trim();
        if (!trimmed) return 0;

        // Normalize whitespace to reduce variance.
        const normalized = trimmed.replace(/\s+/g, " ");
        return Math.max(1, Math.ceil(normalized.length / 4));
    }

    /**
     * Estimate tokens for JSON payloads (stringified without whitespace).
     */
    static estimateTokensForJson(value: unknown): number {
        try {
            return TokenCalculator.estimateTokensForText(JSON.stringify(value));
        } catch {
            return 0;
        }
    }

    /**
     * Estimate tokens for an OpenAI-style chat prompt.
     * Adds a small per-message overhead to better match typical tokenizers.
     */
    static estimateTokensForChatMessages(
        messages: Array<{ role: string; content: string }>,
    ): number {
        if (!Array.isArray(messages) || messages.length === 0) return 0;
        const perMessageOverhead = 6;
        const total = messages.reduce((sum, msg) => {
            const roleTokens = TokenCalculator.estimateTokensForText(msg.role);
            const contentTokens = TokenCalculator.estimateTokensForText(msg.content);
            return sum + perMessageOverhead + roleTokens + contentTokens;
        }, 0);
        return Math.max(0, total);
    }

    /**
     * Estimate total LLM tokens for search summarization prompts.
     * This is used to include research overhead in upfront slide-token charging.
     */
    static estimateTokensForSearchSummarization(params: SearchTokenEstimateParams): {
        estimatedTotalTokens: number;
        estimatedPromptTokens: number;
        estimatedCompletionTokens: number;
    } {
        const {
            query,
            maxResults = 5,
            includeSummarization = true,
            summarizationMaxOutputTokens = 500,
        } = params;

        if (!includeSummarization) {
            return {
                estimatedTotalTokens: 0,
                estimatedPromptTokens: 0,
                estimatedCompletionTokens: 0,
            };
        }

        const cappedResults = Math.min(8, Math.max(1, Math.floor(maxResults)));

        // Approximate the compact sources JSON structure used in SearchService.
        // Keep it conservative but not extreme.
        const approxSource = {
            url: "https://example.com",
            title: "Example title",
            snippet: "Example snippet text describing the result in a compact, factual way.",
            retrieved_at: "2026-01-01T00:00:00.000Z",
        };
        const approxSources = Array.from({ length: cappedResults }, () => approxSource);

        const systemPrompt =
            "You are a research summarizer. Produce a compact, factual summary of the provided web results for the user's topic. Keep it concise and actionable. Use 4-7 bullet points max. Do not invent facts. If sources are thin, say so.";

        const userPrompt = `User topic: ${String(query ?? "").trim() || "(not provided)"}\n\nSources (JSON):\n${JSON.stringify(approxSources)}`;

        const estimatedPromptTokens = TokenCalculator.estimateTokensForChatMessages([
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ]);

        // Completion is capped by max_tokens; estimate at 60% of cap to avoid
        // chronic overestimation while still accounting for non-trivial outputs.
        const estimatedCompletionTokens = Math.max(
            0,
            Math.floor(summarizationMaxOutputTokens * 0.6),
        );

        const estimatedTotalTokens = estimatedPromptTokens + estimatedCompletionTokens;

        return {
            estimatedTotalTokens,
            estimatedPromptTokens,
            estimatedCompletionTokens,
        };
    }

    /**
     * Convert an estimated LLM token count into slide tokens.
     */
    static estimateSlideTokensFromLlmTokens(llmTokens: number): number {
        if (!Number.isFinite(llmTokens) || llmTokens <= 0) return 0;
        return llmTokens / 1000.0;
    }

    /**
     * Estimate slide-token overhead for enabling web research (search + summarization).
     */
    static estimateSearchSlideTokenOverhead(params: SearchTokenEstimateParams): number {
        const { estimatedTotalTokens } =
            TokenCalculator.estimateTokensForSearchSummarization(params);
        // Small safety margin to cover tokenizer variance.
        const withMargin = estimatedTotalTokens * 1.15;
        return Math.round(TokenCalculator.estimateSlideTokensFromLlmTokens(withMargin) * 10) / 10;
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
            comprehensive: "3x more tokens",
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
        estimatedTokens: number,
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
