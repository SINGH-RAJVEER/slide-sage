import type React from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TopicInput } from "./TopicInput";

interface GenerateFormProps {
    prompt: string;
    loading: boolean;
    onPromptChange: (value: string) => void;
    onGenerate: () => void;
}

export const GenerateForm: React.FC<GenerateFormProps> = ({
    prompt,
    loading,
    onPromptChange,
    onGenerate,
}) => {
    return (
        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4">
            <TopicInput
                prompt={prompt}
                onPromptChange={onPromptChange}
                onGenerate={onGenerate}
                disabled={loading}
                loading={loading}
            />

            <Button
                onClick={onGenerate}
                disabled={loading || !prompt.trim()}
                className="h-11 rounded-md border border-white/20 bg-white/10 px-6 text-white transition-colors hover:bg-white/15"
            >
                {loading ? (
                    <>
                        <Spinner />
                        Creating...
                    </>
                ) : (
                    "Generate"
                )}
            </Button>
        </div>
    );
};
