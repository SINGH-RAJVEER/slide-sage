import { Maximize2, Minimize2 } from "lucide-react";
import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

interface TopicInputProps {
    prompt: string;
    onPromptChange: (value: string) => void;
    onGenerate: () => void;
    disabled: boolean;
    loading: boolean;
}

export const TopicInput: React.FC<TopicInputProps> = ({
    prompt,
    onPromptChange,
    onGenerate,
    disabled,
    loading,
}) => {
    const [expanded, setExpanded] = useState(false);
    const [canExpand, setCanExpand] = useState(false);
    const compactTextareaRef = useRef<HTMLTextAreaElement>(null);
    const expandedTextareaRef = useRef<HTMLTextAreaElement>(null);

    useLayoutEffect(() => {
        if (!prompt) {
            setCanExpand(false);
            return;
        }

        const textarea = compactTextareaRef.current;
        if (!textarea) return;
        setCanExpand(textarea.scrollHeight > textarea.clientHeight + 1);
    }, [prompt]);

    useEffect(() => {
        const updateOverflow = () => {
            const textarea = compactTextareaRef.current;
            if (!textarea) return;
            setCanExpand(textarea.scrollHeight > textarea.clientHeight + 1);
        };

        window.addEventListener("resize", updateOverflow);
        return () => window.removeEventListener("resize", updateOverflow);
    }, []);

    const handleCompactKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;

        event.preventDefault();
        onGenerate();
    };

    const handleExpandedKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== "Enter" || !event.shiftKey || event.nativeEvent.isComposing) return;

        event.preventDefault();
        onGenerate();
    };

    return (
        <Dialog open={expanded} onOpenChange={setExpanded}>
            <div className="relative mx-auto w-full max-w-xl">
                <label htmlFor="prompt" className="sr-only">
                    Presentation prompt
                </label>
                <textarea
                    ref={compactTextareaRef}
                    id="prompt"
                    rows={1}
                    aria-describedby="compact-prompt-hint"
                    placeholder="What's on your mind ?"
                    value={prompt}
                    onChange={(e) => onPromptChange(e.target.value)}
                    onKeyDown={handleCompactKeyDown}
                    className="field-sizing-content min-h-[60px] max-h-48 w-full resize-none overflow-y-auto rounded-lg border border-white/10 bg-black/20 px-4 py-4 text-center text-lg leading-7 text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/25 disabled:cursor-not-allowed disabled:opacity-60 md:text-xl"
                    disabled={disabled}
                    autoFocus
                />
                {canExpand && (
                    <button
                        type="button"
                        onClick={() => setExpanded(true)}
                        disabled={disabled}
                        aria-label="Expand prompt editor"
                        className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-md bg-black/25 text-white/45 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:pointer-events-none md:size-9"
                    >
                        <Maximize2 className="size-4" />
                    </button>
                )}
            </div>

            <p id="compact-prompt-hint" className="text-center text-xs text-white/40 md:text-sm">
                Press <span className="text-white/60">Enter</span> to generate
            </p>

            <DialogContent
                showCloseButton={false}
                className="flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-white/15 bg-[#0a0a0a] p-0 text-white shadow-2xl sm:h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)]"
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    expandedTextareaRef.current?.focus();
                }}
            >
                <DialogTitle className="sr-only">Expanded presentation prompt</DialogTitle>
                <DialogDescription className="sr-only">
                    Write a detailed presentation prompt. Enter adds a new line and Shift plus Enter
                    starts generation.
                </DialogDescription>

                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
                    <p className="text-sm font-medium text-white/70">Presentation prompt</p>
                    <DialogClose asChild>
                        <button
                            type="button"
                            aria-label="Shrink prompt editor"
                            className="flex size-11 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 md:size-9"
                        >
                            <Minimize2 className="size-4" />
                        </button>
                    </DialogClose>
                </div>

                <label htmlFor="expanded-prompt" className="sr-only">
                    Expanded presentation prompt
                </label>
                <textarea
                    ref={expandedTextareaRef}
                    id="expanded-prompt"
                    aria-describedby="expanded-prompt-hint"
                    value={prompt}
                    onChange={(event) => onPromptChange(event.target.value)}
                    onKeyDown={handleExpandedKeyDown}
                    placeholder="Describe the presentation you want to create"
                    disabled={disabled}
                    className="m-4 min-h-0 flex-1 resize-none rounded-lg border border-white/10 bg-white/[0.03] p-5 text-base leading-7 text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/25 disabled:cursor-not-allowed disabled:opacity-60 sm:m-6 sm:p-7 sm:text-lg"
                />

                <div className="flex flex-col items-center justify-between gap-3 border-t border-white/10 px-4 py-3 sm:flex-row sm:px-6">
                    <p
                        id="expanded-prompt-hint"
                        className="text-center text-xs text-white/40 sm:text-left"
                    >
                        Enter for a new line. Shift + Enter to generate.
                    </p>
                    <Button
                        type="button"
                        onClick={onGenerate}
                        disabled={disabled || !prompt.trim()}
                        className="h-11 w-full border border-white/20 bg-white/10 px-6 text-white hover:bg-white/15 sm:w-auto"
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
            </DialogContent>
        </Dialog>
    );
};
