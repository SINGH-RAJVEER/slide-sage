import { X } from "lucide-react";
import type React from "react";
import { Input } from "@/components/ui/input";

interface TopicInputProps {
    prompt: string;
    topics: string[];
    onPromptChange: (value: string) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onRemoveTopic: (topic: string) => void;
    onEditTopic: (index: number, value: string) => void;
    disabled: boolean;
}

export const TopicInput: React.FC<TopicInputProps> = ({
    prompt,
    topics,
    onPromptChange,
    onKeyDown,
    onRemoveTopic,
    onEditTopic,
    disabled,
}) => {
    const topicCounts = new Map<string, number>();
    const topicEntries = topics.map((topic, index) => {
        const count = (topicCounts.get(topic) ?? 0) + 1;
        topicCounts.set(topic, count);

        return {
            key: `${topic}-${count}`,
            topic,
            index,
        };
    });

    return (
        <div className="relative w-full flex flex-col items-center justify-center">
            <div className="absolute bottom-[calc(100%+2rem)] left-0 right-0 max-h-[30vh] overflow-y-auto custom-scrollbar flex flex-wrap gap-2 justify-center">
                {topicEntries.length > 0 &&
                    topicEntries.map(({ key, topic, index }) => (
                        <div
                            key={key}
                            className="group flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-white/90 transition-colors hover:bg-white/10"
                        >
                            <button
                                type="button"
                                onClick={() => onRemoveTopic(topic)}
                                className="p-1 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                                disabled={disabled}
                            >
                                <X className="h-4 w-4" />
                            </button>
                            <input
                                type="text"
                                value={topic}
                                onChange={(e) => onEditTopic(index, e.target.value)}
                                disabled={disabled}
                                className="flex-none w-auto p-0 bg-transparent text-white/90 font-light tracking-wide text-base focus:outline-none focus:ring-0"
                                style={{ width: `${Math.max(topic.length, 1)}ch` }}
                                aria-label={`Topic ${index + 1}`}
                            />
                        </div>
                    ))}
            </div>

            <div className="w-full relative mx-auto max-w-xl">
                <Input
                    id="prompt"
                    placeholder={
                        topics.length === 0 ? "What's on your mind ?" : "Add additional context ?"
                    }
                    value={prompt}
                    onChange={(e) => onPromptChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    className="h-auto w-full rounded-lg border border-white/10 bg-black/20 px-4 py-4 text-center text-lg text-white placeholder:text-white/35 focus-visible:border-white/25 focus-visible:ring-0 md:text-xl"
                    disabled={disabled}
                    autoFocus
                />
            </div>

            {topics.length === 0 && !prompt.trim() && (
                <p className="absolute top-[calc(100%+2rem)] text-center text-sm text-white/45 w-full">
                    Press <span className="text-white/50">Enter</span> to add a topic
                </p>
            )}

            {(topics.length > 0 || prompt.trim()) && (
                <p className="absolute top-[calc(100%+2rem)] text-center text-sm text-white/45 w-full">
                    Press <span className="text-white/50">Shift + Enter</span> to generate
                </p>
            )}
        </div>
    );
};
