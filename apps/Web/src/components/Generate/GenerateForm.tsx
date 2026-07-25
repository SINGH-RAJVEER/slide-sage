import type React from "react";
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
        </div>
    );
};
