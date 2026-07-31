import { Button } from "@slidesage/ui/components/button";
import { Spinner } from "@slidesage/ui/components/spinner";
import { Maximize2, Minimize2 } from "lucide-react";
import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

interface TopicInputProps {
    prompt: string;
    onPromptChange: (value: string) => void;
    onGenerate: () => void;
    disabled: boolean;
    loading: boolean;
}

function getExpandedEditorBounds() {
    const estimate = document.querySelector<HTMLElement>("[data-generation-estimate]");
    const selectors = document.querySelector<HTMLElement>("[data-generation-selectors]");
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const edgeMargin = window.innerWidth >= 640 ? 16 : 12;
    const topGap = 16;
    const anchorBottom = (estimate ?? selectors)?.getBoundingClientRect().bottom;
    const top = Math.max(viewportTop + edgeMargin, (anchorBottom ?? viewportTop) + topGap);

    return {
        top,
        left: viewportLeft + edgeMargin,
        width: Math.max(0, viewportWidth - edgeMargin * 2),
        height: Math.max(0, viewportTop + viewportHeight - edgeMargin - top),
    };
}

export const TopicInput: React.FC<TopicInputProps> = ({
    prompt,
    onPromptChange,
    onGenerate,
    disabled,
    loading,
}) => {
    const [expanded, setExpanded] = useState(false);
    const [morphing, setMorphing] = useState(false);
    const [canExpand, setCanExpand] = useState(false);
    const [compactHeight, setCompactHeight] = useState<number>();
    const [expandedBounds, setExpandedBounds] = useState({
        top: 16,
        left: 16,
        width: 0,
        height: 0,
    });
    const composerRef = useRef<HTMLFieldSetElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const toggleRef = useRef<HTMLButtonElement>(null);
    const transitionSequenceRef = useRef(0);

    useLayoutEffect(() => {
        if (expanded) return;
        if (!prompt) {
            setCanExpand(false);
            return;
        }

        const textarea = textareaRef.current;
        if (!textarea) return;
        setCanExpand(textarea.scrollHeight > textarea.clientHeight + 1);
    }, [expanded, prompt]);

    useEffect(() => {
        const updateOverflow = () => {
            if (expanded) return;
            const textarea = textareaRef.current;
            if (!textarea) return;
            setCanExpand(textarea.scrollHeight > textarea.clientHeight + 1);
        };

        window.addEventListener("resize", updateOverflow);
        return () => window.removeEventListener("resize", updateOverflow);
    }, [expanded]);

    useEffect(() => {
        if (!expanded) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const updateBounds = () => setExpandedBounds(getExpandedEditorBounds());
        window.addEventListener("resize", updateBounds);
        window.visualViewport?.addEventListener("resize", updateBounds);
        window.visualViewport?.addEventListener("scroll", updateBounds);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("resize", updateBounds);
            window.visualViewport?.removeEventListener("resize", updateBounds);
            window.visualViewport?.removeEventListener("scroll", updateBounds);
        };
    }, [expanded]);

    useEffect(() => {
        return () => {
            transitionSequenceRef.current += 1;
        };
    }, []);

    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    const setEditorExpanded = (nextExpanded: boolean) => {
        if (nextExpanded === expanded || morphing) return;

        const composer = composerRef.current;
        const nextCompactHeight = nextExpanded
            ? composer?.getBoundingClientRect().height
            : undefined;
        const nextBounds = nextExpanded ? getExpandedEditorBounds() : expandedBounds;

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (typeof document.startViewTransition !== "function" || reduceMotion) {
            if (nextCompactHeight) setCompactHeight(nextCompactHeight);
            if (nextExpanded) setExpandedBounds(nextBounds);
            setExpanded(nextExpanded);
            if (nextExpanded) requestAnimationFrame(() => textareaRef.current?.focus());
            return;
        }

        const sequence = ++transitionSequenceRef.current;
        const transition = document.startViewTransition(() => {
            flushSync(() => {
                if (nextCompactHeight) setCompactHeight(nextCompactHeight);
                if (nextExpanded) setExpandedBounds(nextBounds);
                setMorphing(true);
                setExpanded(nextExpanded);
            });
        });
        void transition.finished.then(
            () => {
                if (transitionSequenceRef.current !== sequence) return;
                setMorphing(false);
                if (nextExpanded) textareaRef.current?.focus();
            },
            () => {
                if (transitionSequenceRef.current === sequence) setMorphing(false);
            },
        );
    };

    const handleExpandedControlKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
        if (!expanded) return;
        if (event.key === "Escape") {
            event.preventDefault();
            setEditorExpanded(false);
        }
    };

    const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        handleExpandedControlKeyDown(event);
        if (event.defaultPrevented) return;
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        if (morphing) return;

        const shouldGenerate = expanded ? event.shiftKey : !event.shiftKey;
        if (!shouldGenerate) return;

        event.preventDefault();
        onGenerate();
    };

    const showExpandedLayer = expanded || morphing;

    return (
        <div
            className="relative mx-auto w-full max-w-xl"
            style={showExpandedLayer && compactHeight ? { height: compactHeight } : undefined}
        >
            <fieldset
                ref={composerRef}
                className={
                    expanded
                        ? "fixed z-[60] m-0 flex min-w-0 flex-col border-0 p-0"
                        : "relative m-0 flex w-full min-w-0 flex-col items-center gap-4 border-0 p-0"
                }
                style={
                    expanded
                        ? {
                              top: expandedBounds.top,
                              left: expandedBounds.left,
                              width: expandedBounds.width,
                              height: expandedBounds.height,
                          }
                        : undefined
                }
            >
                <legend className="sr-only">
                    {expanded ? "Expanded presentation prompt" : "Presentation prompt composer"}
                </legend>
                <div
                    className={
                        expanded
                            ? "generation-prompt-input relative min-h-0 w-full flex-1"
                            : "generation-prompt-input relative w-full"
                    }
                >
                    <label htmlFor="prompt" className="sr-only">
                        Presentation prompt
                    </label>
                    <textarea
                        ref={textareaRef}
                        id="prompt"
                        rows={1}
                        aria-describedby="prompt-editor-hint"
                        placeholder="What's on your mind ?"
                        value={prompt}
                        onChange={(event) => onPromptChange(event.target.value)}
                        onKeyDown={handleTextareaKeyDown}
                        className={
                            expanded
                                ? "h-full min-h-0 w-full resize-none overflow-y-auto rounded-lg border border-white/15 bg-black/20 p-5 pb-20 pr-14 text-left text-base leading-7 text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/30 disabled:cursor-not-allowed disabled:opacity-60 sm:p-7 sm:pb-20 sm:pr-16 sm:text-lg"
                                : "field-sizing-content min-h-[60px] max-h-48 w-full resize-none overflow-y-auto rounded-lg border border-white/10 bg-black/20 px-4 py-4 text-center text-lg leading-7 text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/25 disabled:cursor-not-allowed disabled:opacity-60 md:text-xl"
                        }
                        disabled={disabled}
                    />

                    {(expanded || canExpand) && (
                        <button
                            ref={toggleRef}
                            type="button"
                            onClick={() => setEditorExpanded(!expanded)}
                            onKeyDown={handleExpandedControlKeyDown}
                            disabled={disabled || morphing}
                            aria-label={expanded ? "Shrink prompt editor" : "Expand prompt editor"}
                            className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-md text-white/45 transition-[color,background-color,transform] duration-200 hover:bg-white/10 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:pointer-events-none md:size-9"
                        >
                            {expanded ? (
                                <Minimize2 className="size-4" />
                            ) : (
                                <Maximize2 className="size-4" />
                            )}
                        </button>
                    )}
                </div>

                <div
                    className={
                        expanded
                            ? "pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-end justify-between gap-3"
                            : "flex flex-col items-center gap-4"
                    }
                >
                    <p
                        id="prompt-editor-hint"
                        className={
                            expanded
                                ? "max-w-[calc(100%-8rem)] text-left text-xs text-white/40"
                                : "text-center text-xs text-white/40 md:text-sm"
                        }
                    >
                        {expanded ? (
                            "Enter for a new line. Shift + Enter to generate."
                        ) : (
                            <>
                                Press <span className="text-white/60">Enter</span> to generate
                            </>
                        )}
                    </p>

                    <Button
                        type="button"
                        onClick={() => {
                            if (!morphing) onGenerate();
                        }}
                        onKeyDown={handleExpandedControlKeyDown}
                        disabled={disabled || !prompt.trim()}
                        className={`generation-prompt-action h-11 rounded-md border border-white/20 bg-white/10 px-6 text-white transition-[background-color,transform] duration-200 hover:bg-white/15 active:scale-[0.98] ${expanded ? "pointer-events-auto ml-auto shrink-0" : ""}`}
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
            </fieldset>
        </div>
    );
};
