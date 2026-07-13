/**
 * Stream Processing Utilities
 * Handles streaming content extraction and slide parsing
 */

export interface StreamChunk {
    choices?: Array<{
        delta?: {
            content?: string;
        };
        finish_reason?: string | null;
    }>;
    usage?: {
        total_tokens?: number;
    };
}

export interface ExtractedSlide {
    index: number;
    slide: Record<string, unknown>;
}

export class StreamProcessor {
    private accumulatedContent = "";
    private slidesYielded = 0;
    public themeYielded = false;
    public titleExtracted: string | null = null;
    private totalTokensUsed = 0;
    private chunkCount = 0;

    /**
     * Extract content from a streaming chunk.
     */
    processChunk(chunk: StreamChunk): string {
        this.chunkCount++;
        let chunkContent = "";

        if (chunk.usage) {
            this.totalTokensUsed = chunk.usage.total_tokens || 0;
            console.info(`Token usage detected: ${this.totalTokensUsed}`);
        }

        const choice = chunk.choices?.[0];
        if (choice?.delta?.content) {
            chunkContent = choice.delta.content;
        }

        if (this.chunkCount % 100 === 0) {
            console.info(
                `Processed ${this.chunkCount} chunks, accumulated ${this.accumulatedContent.length} characters`
            );
        }

        return chunkContent;
    }

    /**
     * Add chunk content to accumulated content
     */
    accumulateContent(chunkContent: string): void {
        this.accumulatedContent += chunkContent;
    }

    /**
     * Get content with markdown code blocks removed
     */
    getCleanContent(): string {
        let cleanContent = this.accumulatedContent.trim();

        if (cleanContent.startsWith("```json")) {
            cleanContent = cleanContent.replace("```json", "").replace(/```$/, "").trim();
        } else if (cleanContent.startsWith("```")) {
            cleanContent = cleanContent.replace(/^```/, "").replace(/```$/, "").trim();
        }

        return cleanContent;
    }

    /**
     * Try to extract theme from accumulated content
     */
    extractTheme(): string | null {
        if (this.themeYielded) {
            return null;
        }

        const cleanContent = this.getCleanContent();
        const themeMatch = cleanContent.match(/"theme"\s*:\s*"([^"]*)"/);

        const theme = themeMatch?.[1];
        if (theme !== undefined) {
            this.themeYielded = true;
            return theme;
        }

        return null;
    }

    /**
     * Extract complete slide objects from accumulated content.
     * Returns list of tuples containing (index, slide_dict) for newly extracted slides
     */
    extractSlides(): ExtractedSlide[] {
        const cleanContent = this.getCleanContent();

        // Look for complete slide objects in the slides array
        const slidesPattern = /"slides"\s*:\s*\[/;
        const slidesMatch = cleanContent.match(slidesPattern);

        if (!slidesMatch || slidesMatch.index === undefined) {
            return [];
        }

        // Find all complete slide objects
        const slidesStart = slidesMatch.index + slidesMatch[0].length;
        const remaining = cleanContent.slice(slidesStart);

        // Parse complete slide objects
        let bracketCount = 0;
        let slideStart = -1;
        let inString = false;
        let escapeNext = false;

        const extractedSlides: Record<string, unknown>[] = [];

        for (let i = 0; i < remaining.length; i++) {
            const char = remaining[i];

            if (escapeNext) {
                escapeNext = false;
                continue;
            }
            if (char === "\\") {
                escapeNext = true;
                continue;
            }
            if (char === '"' && !escapeNext) {
                inString = !inString;
                continue;
            }
            if (inString) {
                continue;
            }

            if (char === "{") {
                if (bracketCount === 0) {
                    slideStart = i;
                }
                bracketCount++;
            } else if (char === "}") {
                bracketCount--;
                if (bracketCount === 0 && slideStart >= 0) {
                    // Found a complete slide object
                    const slideJson = remaining.slice(slideStart, i + 1);
                    try {
                        const slideObj = JSON.parse(slideJson);
                        extractedSlides.push(slideObj);
                    } catch (_e) {
                        // Invalid JSON, skip
                    }
                    slideStart = -1;
                }
            } else if (char === "]" && bracketCount === 0) {
                // End of slides array
                break;
            }
        }

        // Return only newly extracted slides with their indices
        const startIdx = this.slidesYielded;
        const newSlides = extractedSlides.slice(this.slidesYielded);
        this.slidesYielded = extractedSlides.length;

        return newSlides.map((slide, i) => ({
            index: startIdx + i,
            slide,
        }));
    }

    /**
     * Extract title from a slide.
     */
    extractTitleFromSlide(slide: Record<string, unknown>): string | null {
        if (this.titleExtracted) {
            return this.titleExtracted;
        }

        if (slide["title"] && typeof slide["title"] === "string") {
            this.titleExtracted = slide["title"];
        } else if (slide["html"] && typeof slide["html"] === "string") {
            const html = slide["html"];

            // Try to find title with id="slide-title"
            const titleMatch = html.match(
                /<h[12][^>]*id=["']slide-title["'][^>]*>([^<]+)<\/h[12]>/
            );
            const title = titleMatch?.[1];
            if (title !== undefined) {
                this.titleExtracted = title.trim();
            } else {
                // Fallback to any h1/h2
                const headerMatch = html.match(/<h[12][^>]*>([^<]+)<\/h[12]>/);
                const header = headerMatch?.[1];
                if (header !== undefined) {
                    this.titleExtracted = header.trim();
                }
            }
        }

        return this.titleExtracted;
    }

    /**
     * Clean the final accumulated content, removing markdown code blocks.
     */
    cleanFinalContent(): string {
        let cleanContent = this.accumulatedContent.trim();

        if (cleanContent.startsWith("```json")) {
            cleanContent = cleanContent.replace("```json", "").trim();
            if (cleanContent.endsWith("```")) {
                cleanContent = cleanContent.replace(/```$/, "").trim();
            }
        } else if (cleanContent.startsWith("```")) {
            cleanContent = cleanContent.replace(/^```/, "").trim();
            if (cleanContent.endsWith("```")) {
                cleanContent = cleanContent.replace(/```$/, "").trim();
            }
        }

        return cleanContent;
    }

    // Getters for accessing internal state
    get totalTokens(): number {
        return this.totalTokensUsed;
    }

    get processedChunks(): number {
        return this.chunkCount;
    }

    get extractedTitle(): string | null {
        return this.titleExtracted;
    }

    get slidesProcessed(): number {
        return this.slidesYielded;
    }

    // Public accessors for AI service
    get currentSlidesYielded(): number {
        return this.slidesYielded;
    }

    set currentSlidesYielded(value: number) {
        this.slidesYielded = value;
    }

    get currentTotalTokensUsed(): number {
        return this.totalTokensUsed;
    }
}
