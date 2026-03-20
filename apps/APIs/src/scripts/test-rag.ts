#!/usr/bin/env bun
/**
 * RAG Implementation and Embeddings Test Script
 *
 * This script tests the RAG service and embedding model:
 * 1. Verifies LiteLLM proxy is accessible
 * 2. Tests embedding generation
 * 3. Tests search embedding storage
 * 4. Tests presentation embedding storage
 * 5. Tests similarity search and retrieval
 * 6. Tests RAG context building
 */

import type { Slide } from "@slide-sage/contracts";
import { RAGService } from "../services/rag.service";

// Test configuration
const TEST_CONFIG = {
    userId: `test-user-${Date.now()}`,
    presentationId: `test-pres-${Date.now()}`,
    litellmProxyBase: process.env.LITELLM_PROXY_BASE || "http://localhost:4000",
    embeddingModel: process.env.EMBEDDING_MODEL || "gemini/text-embedding-004",
};

// ANSI color codes for better output
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
};

function log(color: string, symbol: string, message: string) {
    console.log(`${color}${symbol}${colors.reset} ${message}`);
}

function success(message: string) {
    log(colors.green, "✓", message);
}

function error(message: string) {
    log(colors.red, "✗", message);
}

function info(message: string) {
    log(colors.cyan, "ℹ", message);
}

function warning(message: string) {
    log(colors.yellow, "⚠", message);
}

function heading(message: string) {
    console.log(`\n${colors.bright}${colors.blue}${"═".repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}${message}${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}${"═".repeat(60)}${colors.reset}\n`);
}

function subheading(message: string) {
    console.log(`\n${colors.cyan}${message}${colors.reset}`);
    console.log(`${colors.cyan}${"─".repeat(60)}${colors.reset}`);
}

/**
 * Test 1: Check LiteLLM Proxy Availability
 */
async function testLiteLLMProxy(): Promise<boolean> {
    subheading("Test 1: LiteLLM Proxy Availability");

    try {
        info(`Checking LiteLLM proxy at: ${TEST_CONFIG.litellmProxyBase}`);

        const healthUrl = `${TEST_CONFIG.litellmProxyBase}/health`;
        const response = await fetch(healthUrl);

        if (response.ok) {
            success("LiteLLM proxy is accessible");
            return true;
        }

        error(`LiteLLM proxy returned status: ${response.status}`);
        return false;
    } catch (err) {
        error(`Cannot reach LiteLLM proxy: ${err instanceof Error ? err.message : String(err)}`);
        warning("Make sure LiteLLM proxy is running on port 4000");
        warning("Start it with: litellm --config litellm_config.yaml --port 4000");
        return false;
    }
}

/**
 * Test 2: Embedding Generation
 */
async function testEmbeddingGeneration(): Promise<boolean> {
    subheading("Test 2: Embedding Generation");

    const ragService = new RAGService();
    const testTexts = [
        "This is a simple test string.",
        "Machine learning and artificial intelligence are transforming technology.",
        "The quick brown fox jumps over the lazy dog.",
    ];

    try {
        for (const text of testTexts) {
            info(
                `Generating embedding for: "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`
            );

            const result = await ragService.generateEmbedding(text);

            if (!result || !result.embedding || !Array.isArray(result.embedding)) {
                error("Invalid embedding result structure");
                return false;
            }

            const dimension = result.embedding.length;
            const sampleValues = result.embedding.slice(0, 5).map((v: number) => v.toFixed(4));

            success(`Generated embedding with dimension: ${dimension}`);
            info(`Model used: ${result.model}`);
            info(`Sample values: [${sampleValues.join(", ")}...]`);

            // Verify dimension (Gemini text-embedding-004 uses 768 dimensions)
            if (dimension !== 768) {
                warning(`Expected dimension 768 but got ${dimension}`);
                warning("This may cause database insertion issues!");
            }

            // Verify values are numbers
            const hasNaN = result.embedding.some(
                (v: number) => typeof v !== "number" || Number.isNaN(v)
            );
            if (hasNaN) {
                error("Embedding contains NaN or non-numeric values");
                return false;
            }

            console.log();
        }

        return true;
    } catch (err) {
        error(`Embedding generation failed: ${err instanceof Error ? err.message : String(err)}`);
        if (err instanceof Error && err.stack) {
            console.error(err.stack);
        }
        return false;
    }
}

/**
 * Test 3: Search Embedding Storage
 */
async function testSearchEmbeddingStorage(): Promise<boolean> {
    subheading("Test 3: Search Embedding Storage");

    const ragService = new RAGService();
    const searchQueries = [
        "How to build a React application",
        "Best practices for TypeScript development",
        "Introduction to machine learning with Python",
        "Database optimization techniques for PostgreSQL",
        "Modern web development frameworks comparison",
    ];

    try {
        info(`Storing ${searchQueries.length} search embeddings...`);

        for (const query of searchQueries) {
            const result = await ragService.storeSearchEmbedding(TEST_CONFIG.userId, query);

            if (!result) {
                error(`Failed to store search embedding for: "${query}"`);
                return false;
            }

            success(`Stored: "${query.substring(0, 50)}${query.length > 50 ? "..." : ""}"`);
            info(`  ID: ${result.id}`);
            info(`  Model: ${result.embeddingModel}`);
            if (result.metadata) {
                info(`  Metadata: ${JSON.stringify(result.metadata)}`);
            }
        }

        return true;
    } catch (err) {
        error(
            `Search embedding storage failed: ${err instanceof Error ? err.message : String(err)}`
        );
        if (err instanceof Error && err.stack) {
            console.error(err.stack);
        }
        return false;
    }
}

/**
 * Test 4: Presentation Embedding Storage
 */
async function testPresentationEmbeddingStorage(): Promise<boolean> {
    subheading("Test 4: Presentation Embedding Storage");

    const ragService = new RAGService();

    const sampleSlides: Slide[] = [
        {
            id: "slide-1",
            type: "title",
            title: "Introduction to Machine Learning",
            content: "A comprehensive overview of ML fundamentals and applications",
            notes: "Start with engaging hook",
        },
        {
            id: "slide-2",
            type: "content",
            title: "Supervised Learning",
            content: "Classification and regression algorithms, decision trees, neural networks",
            notes: "Use visual examples",
        },
        {
            id: "slide-3",
            type: "content",
            title: "Unsupervised Learning",
            content: "Clustering, dimensionality reduction, anomaly detection",
        },
        {
            id: "slide-4",
            type: "content",
            title: "Real-World Applications",
            content: "Healthcare diagnostics, financial forecasting, autonomous vehicles",
            notes: "Show case studies",
        },
    ];

    const iterationPrompts = [
        "Create a comprehensive presentation about machine learning",
        "Make the content more technical with code examples",
        "Add more visual elements and diagrams",
        "Focus on practical applications and case studies",
    ];

    try {
        info(`Storing ${iterationPrompts.length} presentation embeddings...`);

        for (const prompt of iterationPrompts) {
            const result = await ragService.storePresentationEmbedding(
                TEST_CONFIG.presentationId,
                TEST_CONFIG.userId,
                prompt,
                sampleSlides
            );

            if (!result) {
                error(`Failed to store presentation embedding for: "${prompt}"`);
                return false;
            }

            success(`Stored: "${prompt.substring(0, 50)}${prompt.length > 50 ? "..." : ""}"`);
            info(`  ID: ${result.id}`);
            info(`  Model: ${result.embeddingModel}`);
            if (result.metadata) {
                info(`  Metadata: ${JSON.stringify(result.metadata)}`);
            }
        }

        return true;
    } catch (err) {
        error(
            `Presentation embedding storage failed: ${err instanceof Error ? err.message : String(err)}`
        );
        if (err instanceof Error && err.stack) {
            console.error(err.stack);
        }
        return false;
    }
}

/**
 * Test 5: Similarity Search and Retrieval
 */
async function testSimilaritySearch(): Promise<boolean> {
    subheading("Test 5: Similarity Search and Retrieval");

    const ragService = new RAGService();

    const testQueries = [
        {
            query: "Building web applications with React",
            expectedSimilar: "How to build a React application",
        },
        {
            query: "Machine learning fundamentals",
            expectedSimilar: "Introduction to machine learning",
        },
        {
            query: "Add more examples and make it practical",
            expectedSimilar: "Focus on practical applications",
        },
    ];

    try {
        for (const { query, expectedSimilar } of testQueries) {
            info(`\nSearching for contexts similar to: "${query}"`);

            const contexts = await ragService.retrieveSimilarContexts(
                TEST_CONFIG.userId,
                TEST_CONFIG.presentationId,
                query,
                5,
                0.5
            );

            if (contexts.length === 0) {
                warning("No similar contexts found");
                warning("This might be expected if the similarity threshold is too high");
                continue;
            }

            success(`Found ${contexts.length} similar context(s):`);

            contexts.forEach((ctx, idx) => {
                const similarityPercent = (ctx.similarity * 100).toFixed(1);
                console.log(`  ${idx + 1}. [${ctx.sourceType}] (${similarityPercent}% similar)`);
                console.log(
                    `     ${ctx.context.substring(0, 80)}${ctx.context.length > 80 ? "..." : ""}`
                );
            });

            // Check if we found the expected similar context
            const foundExpected = contexts.some((ctx) =>
                ctx.context.toLowerCase().includes(expectedSimilar.toLowerCase().substring(0, 20))
            );

            if (foundExpected) {
                success(`✓ Found expected similar context: "${expectedSimilar}"`);
            } else {
                info(`Expected to find similar to: "${expectedSimilar}"`);
            }
        }

        return true;
    } catch (err) {
        error(`Similarity search failed: ${err instanceof Error ? err.message : String(err)}`);
        if (err instanceof Error && err.stack) {
            console.error(err.stack);
        }
        return false;
    }
}

/**
 * Test 6: RAG Context Building
 */
async function testRagContextBuilding(): Promise<boolean> {
    subheading("Test 6: RAG Context Building");

    const ragService = new RAGService();

    const testQuery = "Make the presentation more engaging with additional examples";

    try {
        info(`Building RAG context for query: "${testQuery}"`);

        const ragContext = await ragService.buildRagContextString(
            TEST_CONFIG.userId,
            TEST_CONFIG.presentationId,
            testQuery
        );

        if (!ragContext || ragContext.length === 0) {
            warning("No RAG context generated");
            warning("This might be expected if no similar contexts were found");
            return true; // Not a failure, just no context
        }

        success("RAG context generated successfully");
        console.log(`\n${colors.cyan}${"─".repeat(60)}${colors.reset}`);
        console.log(ragContext);
        console.log(`${colors.cyan}${"─".repeat(60)}${colors.reset}\n`);

        info(`Context length: ${ragContext.length} characters`);

        // Verify structure
        if (ragContext.includes("RELEVANT PREVIOUS CONTEXTS")) {
            success("Context includes proper header");
        }

        if (ragContext.match(/\d+\./)) {
            success("Context includes numbered items");
        }

        if (ragContext.includes("similarity")) {
            success("Context includes similarity scores");
        }

        return true;
    } catch (err) {
        error(`RAG context building failed: ${err instanceof Error ? err.message : String(err)}`);
        if (err instanceof Error && err.stack) {
            console.error(err.stack);
        }
        return false;
    }
}

/**
 * Test 7: Embedding Similarity Calculation
 */
async function testEmbeddingSimilarity(): Promise<boolean> {
    subheading("Test 7: Embedding Similarity Verification");

    const ragService = new RAGService();

    try {
        info("Testing cosine similarity between embeddings...");

        // Similar texts should have high similarity
        const text1 = "Machine learning and artificial intelligence";
        const text2 = "AI and machine learning technologies";
        const text3 = "The weather is nice today";

        const emb1 = await ragService.generateEmbedding(text1);
        const emb2 = await ragService.generateEmbedding(text2);
        const emb3 = await ragService.generateEmbedding(text3);

        // Calculate cosine similarity manually
        function cosineSimilarity(a: number[], b: number[]): number {
            let dotProduct = 0;
            let normA = 0;
            let normB = 0;

            for (let i = 0; i < a.length; i++) {
                dotProduct += a[i] * b[i];
                normA += a[i] * a[i];
                normB += b[i] * b[i];
            }

            return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        }

        const sim12 = cosineSimilarity(emb1.embedding, emb2.embedding);
        const sim13 = cosineSimilarity(emb1.embedding, emb3.embedding);

        console.log(`\nSimilarity between similar texts: ${(sim12 * 100).toFixed(2)}%`);
        console.log(`  Text 1: "${text1}"`);
        console.log(`  Text 2: "${text2}"`);

        console.log(`\nSimilarity between different texts: ${(sim13 * 100).toFixed(2)}%`);
        console.log(`  Text 1: "${text1}"`);
        console.log(`  Text 3: "${text3}"`);

        if (sim12 > sim13) {
            success("Similar texts have higher similarity (as expected)");
            return true;
        }

        error("Similar texts do not have higher similarity!");
        error("This indicates a problem with the embedding model");
        return false;
    } catch (err) {
        error(
            `Similarity verification failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return false;
    }
}

/**
 * Cleanup test data
 */
async function cleanup(): Promise<void> {
    subheading("Cleanup");

    const ragService = new RAGService();

    try {
        info("Cleaning up test embeddings...");
        const deleted = await ragService.cleanupOldEmbeddings(TEST_CONFIG.userId, 0);
        success(`Deleted ${deleted} test embedding(s)`);
    } catch (err) {
        warning(`Cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
        warning("You may need to manually clean up test data");
    }
}

/**
 * Main test runner
 */
async function runTests() {
    heading("RAG IMPLEMENTATION & EMBEDDINGS TEST SUITE");

    console.log(`${colors.bright}Test Configuration:${colors.reset}`);
    console.log(`  User ID: ${TEST_CONFIG.userId}`);
    console.log(`  Presentation ID: ${TEST_CONFIG.presentationId}`);
    console.log(`  LiteLLM Proxy: ${TEST_CONFIG.litellmProxyBase}`);
    console.log(`  Embedding Model: ${TEST_CONFIG.embeddingModel}`);
    console.log();

    const results: { name: string; passed: boolean }[] = [];

    // Run tests in sequence
    const tests = [
        { name: "LiteLLM Proxy", fn: testLiteLLMProxy },
        { name: "Embedding Generation", fn: testEmbeddingGeneration },
        { name: "Search Embedding Storage", fn: testSearchEmbeddingStorage },
        {
            name: "Presentation Embedding Storage",
            fn: testPresentationEmbeddingStorage,
        },
        { name: "Similarity Search", fn: testSimilaritySearch },
        { name: "RAG Context Building", fn: testRagContextBuilding },
        { name: "Embedding Similarity", fn: testEmbeddingSimilarity },
    ];

    for (const test of tests) {
        try {
            const passed = await test.fn();
            results.push({ name: test.name, passed });

            // Stop on critical failures
            if (
                !passed &&
                (test.name === "LiteLLM Proxy" || test.name === "Embedding Generation")
            ) {
                error(`Critical test failed: ${test.name}`);
                error("Stopping test suite");
                break;
            }
        } catch (err) {
            error(
                `Test "${test.name}" threw an exception: ${err instanceof Error ? err.message : String(err)}`
            );
            results.push({ name: test.name, passed: false });
        }
    }

    // Cleanup
    await cleanup();

    // Summary
    heading("TEST SUMMARY");

    const passed = results.filter((r) => r.passed).length;
    const total = results.length;

    results.forEach((result) => {
        if (result.passed) {
            success(`${result.name}`);
        } else {
            error(`${result.name}`);
        }
    });

    console.log();
    if (passed === total) {
        success(`All ${total} tests passed! 🎉`);
        process.exit(0);
    } else {
        error(`${passed}/${total} tests passed`);
        process.exit(1);
    }
}

// Run tests
runTests().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
