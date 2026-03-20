import { useDebouncedCallback } from "@tanstack/react-pacer/debouncer";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GenerateForm, GenerateOptionsBar } from "@/components/Generate";
import Header from "@/components/Header";
import { useStreaming } from "@/modules/presentations";
import { ROUTES } from "@/router/paths";

export default function GeneratePPTPage() {
    const [prompt, setPrompt] = useState("");
    const [topics, setTopics] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [slideCount, setSlideCount] = useState("5");
    const [slideCountMode, setSlideCountMode] = useState("preset");
    const [customSlideCount, setCustomSlideCount] = useState("5");
    const [detailLevel, setDetailLevel] = useState("balanced");
    const [tonality, setTonality] = useState("professional");
    const [useWebResearch, setUseWebResearch] = useState(false);
    const navigate = useNavigate();
    const { streamingState, startStreaming, resetStreaming } = useStreaming();

    useEffect(() => {
        resetStreaming();
    }, [resetStreaming]);

    useEffect(() => {
        if (streamingState.slides.length >= 1 && loading) {
            setLoading(false);
            navigate(ROUTES.presentation, {
                state: { isStreaming: true },
            });
        }
    }, [streamingState.slides.length, loading, navigate]);

    useEffect(() => {
        if (streamingState.error) {
            setError(streamingState.error);
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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();

            if (e.shiftKey) {
                if (prompt.trim() && !topics.includes(prompt.trim())) {
                    setTopics([...topics, prompt.trim()]);
                }
                if (topics.length > 0 || prompt.trim()) {
                    setTimeout(() => handleGenerate(), 0);
                }
                return;
            }

            if (prompt.trim() && !topics.includes(prompt.trim())) {
                setTopics([...topics, prompt.trim()]);
            }
            setPrompt("");
        }
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

    const handleGenerateInternal = async () => {
        if (topics.length === 0) return;

        setLoading(true);
        setError("");

        const count =
            slideCountMode === "preset" ? parseInt(slideCount, 10) : parseInt(customSlideCount, 10);

        if (useWebResearch) {
            navigate(ROUTES.research, {
                state: {
                    prompt: topics.join(", "),
                    slideCount: count,
                    detailLevel,
                    tonality,
                },
            });
            return;
        }

        const success = await startStreaming(
            topics.join(", "),
            count,
            detailLevel,
            tonality,
            false,
        );

        if (!success) {
            setLoading(false);
        }
    };

    const handleGenerate = useDebouncedCallback(handleGenerateInternal, {
        wait: 500,
        leading: true,
    });

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
            baseTokenPerSlide = 3.0;
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
                    onDetailLevelChange={setDetailLevel}
                    onTonalityChange={setTonality}
                    onUseWebResearchChange={setUseWebResearch}
                    onSlideCountModeChange={setSlideCountMode}
                    onSlideCountChange={setSlideCount}
                    onCustomSlideCountChange={setCustomSlideCount}
                />
            </div>

            <main className="flex-1 w-full flex items-center justify-center px-4 md:px-8 pb-12 overflow-y-auto">
                <div className="w-full max-w-5xl max-h-full">
                    <div className="mx-auto w-full max-w-4xl flex flex-col items-center justify-center">
                        <GenerateForm
                            prompt={prompt}
                            topics={topics}
                            loading={loading}
                            error={error}
                            estimatedTokens={calculateEstimatedTokens()}
                            onPromptChange={setPrompt}
                            onKeyDown={handleKeyDown}
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
