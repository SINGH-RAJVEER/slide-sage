import type { PresentationRetryOptions, ThemeId } from "@slide-sage/types";
import { useDebouncedCallback } from "@tanstack/react-pacer/debouncer";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GenerateForm, GenerateOptionsBar } from "@/components/Generate";
import Header from "@/components/Header";
import { fetchAIConfiguration } from "@/lib/ai-connections";
import { useStreaming } from "@/modules/presentations";
import { ROUTES } from "@/router/paths";

interface GenerateRouteState {
    retry?: PresentationRetryOptions;
    retryPresentationId?: string;
}

export default function GeneratePPTPage() {
    const location = useLocation();
    const retry = (location.state as GenerateRouteState | null)?.retry;
    const retryPresentationId = (location.state as GenerateRouteState | null)?.retryPresentationId;
    const retryPrompt = retry?.prompt.trim() ?? "";
    const retrySlideCount = retry?.slide_count.toString() ?? "5";
    const presetSlideCounts = ["5", "10", "15", "20", "25", "30"];
    const [prompt, setPrompt] = useState("");
    const [topics, setTopics] = useState<string[]>(() => (retryPrompt ? [retryPrompt] : []));
    const [loading, setLoading] = useState(false);
    const [slideCount, setSlideCount] = useState(retrySlideCount);
    const [slideCountMode, setSlideCountMode] = useState(
        presetSlideCounts.includes(retrySlideCount) ? "preset" : "custom",
    );
    const [customSlideCount, setCustomSlideCount] = useState(retrySlideCount);
    const [detailLevel, setDetailLevel] = useState(retry?.detail_level ?? "balanced");
    const [tonality, setTonality] = useState(retry?.tonality ?? "professional");
    const [useWebResearch, setUseWebResearch] = useState(retry?.research_enabled ?? false);
    const [theme, setTheme] = useState<ThemeId>(retry?.theme ?? "corporate-blue");
    const [generationMode, setGenerationMode] = useState<"openrouter" | "byok">("openrouter");
    const navigate = useNavigate();
    const { streamingState, startStreaming } = useStreaming();

    useEffect(() => {
        void fetchAIConfiguration()
            .then((config) => setGenerationMode(config.generation.mode))
            .catch(() => undefined);
    }, []);

    useEffect(() => {
        if (streamingState.error) {
            console.error("Presentation generation failed:", streamingState.error);
            setLoading(false);
        }
    }, [streamingState.error]);

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (
                e.key.toLowerCase() === "f" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                document.activeElement?.tagName !== "INPUT" &&
                document.activeElement?.tagName !== "TEXTAREA"
            ) {
                e.preventDefault();
                const input = document.getElementById("prompt");
                if (input) {
                    input.focus();
                }
            }
        };

        window.addEventListener("keydown", handleGlobalKeyDown);
        return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    }, []);

    const getTopicsWithPrompt = () => {
        const nextPrompt = prompt.trim();
        if (!nextPrompt || topics.includes(nextPrompt)) return topics;
        return [...topics, nextPrompt];
    };

    const handleSubmitPrompt = () => {
        const nextTopics = getTopicsWithPrompt();
        if (nextTopics !== topics) {
            setTopics(nextTopics);
        }
        setPrompt("");
    };

    const handleRemoveTopic = (topicToRemove: string) => {
        setTopics(topics.filter((topic) => topic !== topicToRemove));
    };

    const handleAddTopic = (topicToAdd: string) => {
        if (!topics.includes(topicToAdd)) {
            setTopics([...topics, topicToAdd]);
        }
    };

    const handleEditTopic = (index: number, value: string) => {
        setTopics((prev) => prev.map((topic, i) => (i === index ? value : topic)));
    };

    const handleGenerateInternal = async (selectedTopics = topics) => {
        if (selectedTopics.length === 0 || streamingState.isStreaming) return;

        setLoading(true);

        const count =
            slideCountMode === "preset" ? parseInt(slideCount, 10) : parseInt(customSlideCount, 10);

        if (useWebResearch) {
            navigate(ROUTES.research, {
                state: {
                    prompt: selectedTopics.join(", "),
                    slideCount: count,
                    detailLevel,
                    tonality,
                    theme,
                    retryPresentationId,
                },
            });
            return;
        }

        const streamingRequest = startStreaming(
            selectedTopics.join(", "),
            count,
            detailLevel,
            tonality,
            false,
            undefined,
            retryPresentationId,
            theme,
        );
        navigate(ROUTES.presentation, {
            state: { isStreaming: true },
        });

        const success = await streamingRequest;
        if (!success) {
            setLoading(false);
        }
    };

    const debouncedGenerate = useDebouncedCallback(handleGenerateInternal, {
        wait: 500,
        leading: true,
    });

    const handleGenerate = () => {
        debouncedGenerate(topics);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== "Enter" || !event.shiftKey) return;

        event.preventDefault();
        const nextTopics = getTopicsWithPrompt();
        if (nextTopics.length === 0) return;

        setTopics(nextTopics);
        setPrompt("");
        debouncedGenerate(nextTopics);
    };

    const calculateEstimatedTokens = () => {
        const count =
            slideCountMode === "preset" ? parseInt(slideCount, 10) : parseInt(customSlideCount, 10);

        let baseTokenPerSlide = 1;

        if (detailLevel === "brief") {
            baseTokenPerSlide = 0.6;
        } else if (detailLevel === "concise") {
            baseTokenPerSlide = 0.8;
        } else if (detailLevel === "detailed") {
            baseTokenPerSlide = 2.0;
        } else if (detailLevel === "comprehensive") {
            baseTokenPerSlide = 2.5;
        }

        let tonalityMultiplier = 1.0;
        if (tonality === "casual") {
            tonalityMultiplier = 0.9;
        } else if (tonality === "enthusiastic") {
            tonalityMultiplier = 1.05;
        } else if (tonality === "persuasive") {
            tonalityMultiplier = 1.1;
        }

        return count * baseTokenPerSlide * tonalityMultiplier;
    };

    return (
        <div className="flex flex-col min-h-screen w-full overflow-x-hidden bg-transparent">
            <Header />

            <div className="w-full flex items-center justify-center px-4 pt-6 md:pt-8">
                <GenerateOptionsBar
                    detailLevel={detailLevel}
                    tonality={tonality}
                    useWebResearch={useWebResearch}
                    slideCountMode={slideCountMode}
                    slideCount={slideCount}
                    customSlideCount={customSlideCount}
                    theme={theme}
                    onDetailLevelChange={setDetailLevel}
                    onTonalityChange={setTonality}
                    onUseWebResearchChange={setUseWebResearch}
                    onSlideCountModeChange={setSlideCountMode}
                    onSlideCountChange={setSlideCount}
                    onCustomSlideCountChange={setCustomSlideCount}
                    onThemeChange={setTheme}
                />
            </div>

            <main className="flex-1 w-full flex items-center justify-center px-4 md:px-8 pb-12 overflow-y-auto">
                <div className="w-full max-w-5xl max-h-full">
                    <div className="mx-auto w-full max-w-4xl flex flex-col items-center justify-center">
                        <GenerateForm
                            prompt={prompt}
                            topics={topics}
                            loading={loading || streamingState.isStreaming}
                            estimatedTokens={
                                generationMode === "byok" && !useWebResearch
                                    ? null
                                    : calculateEstimatedTokens()
                            }
                            onPromptChange={setPrompt}
                            onKeyDown={handleKeyDown}
                            onSubmitPrompt={handleSubmitPrompt}
                            onRemoveTopic={handleRemoveTopic}
                            onEditTopic={handleEditTopic}
                            onAddTopic={handleAddTopic}
                            onGenerate={handleGenerate}
                        />
                    </div>
                </div>
            </main>
        </div>
    );
}
