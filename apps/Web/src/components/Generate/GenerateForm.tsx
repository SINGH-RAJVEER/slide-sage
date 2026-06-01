import { Loader2 } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { TopicInput } from "./TopicInput";

interface GenerateFormProps {
    prompt: string;
    topics: string[];
    loading: boolean;
    error: string;
    estimatedTokens: number;
    onPromptChange: (value: string) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onRemoveTopic: (topic: string) => void;
    onEditTopic: (index: number, value: string) => void;
    onAddTopic: (topic: string) => void;
    onGenerate: () => void;
}

const SUGGESTIONS = [
    "Q3 Earnings Report",
    "Product Launch Strategy",
    "Team Onboarding",
    "Marketing Campaign",
    "Competitor Analysis",
    "UX Research Findings",
    "Quarterly OKR Planning",
    "Investor Pitch Deck",
];

export const GenerateForm: React.FC<GenerateFormProps> = ({
    prompt,
    topics,
    loading,
    error,
    estimatedTokens,
    onPromptChange,
    onKeyDown,
    onRemoveTopic,
    onEditTopic,
    onAddTopic,
    onGenerate,
}) => {
    return (
        <div className="w-full relative flex flex-col items-center justify-center min-h-[140px]">
            <div className="absolute bottom-[calc(100%+13rem)] text-center w-full">
                {topics.length > 0 && (
                    <p className="text-lg font-medium text-white/80">
                        Estimated {estimatedTokens.toFixed(1)} points
                    </p>
                )}
            </div>

            {topics.length === 0 && (
                <div className="absolute bottom-[calc(100%+8rem)] flex flex-wrap justify-center gap-3 w-full max-w-3xl">
                    {SUGGESTIONS.map((suggestion) => (
                        <button
                            key={suggestion}
                            type="button"
                            onClick={() => onAddTopic(suggestion)}
                            disabled={loading}
                            className="text-sm px-3 py-1.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 transition-all cursor-pointer"
                        >
                            {suggestion}
                        </button>
                    ))}
                </div>
            )}

            <TopicInput
                prompt={prompt}
                topics={topics}
                onPromptChange={onPromptChange}
                onKeyDown={onKeyDown}
                onRemoveTopic={onRemoveTopic}
                onEditTopic={onEditTopic}
                disabled={loading}
            />

            <div className="absolute top-[calc(100%+4rem)] flex flex-col items-center gap-6 w-full">
                <Button
                    onClick={onGenerate}
                    disabled={loading || topics.length === 0}
                    className="group h-11 rounded-md border border-white/20 bg-white/10 px-6 text-white transition-colors hover:bg-white/15"
                >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            "Start Generating"
                        )}
                    </span>
                </Button>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-200 px-6 py-4 rounded-xl backdrop-blur-sm text-center font-light w-full max-w-xl">
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
};
