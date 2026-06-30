import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";
import type { PresentationData, ResearchPayload, Slide, Source } from "../types/presentation";

interface StreamingState {
    isStreaming: boolean;
    slides: Slide[];
    theme: string;
    title: string;
    totalSlides: number;
    presentationId?: string;
    error?: string;
    isComplete: boolean;
    researchSummary?: string;
    researchSources?: Source[];
    researchStatus?: "idle" | "searching" | "sourced" | "summarizing" | "ready" | "generating";
}

interface StreamingContextValue {
    streamingState: StreamingState;
    startStreaming: (
        prompt: string,
        slideCount: number,
        detailLevel: string,
        tonality: string,
        researchEnabled?: boolean,
        researchPayload?: ResearchPayload,
    ) => Promise<boolean>;
    startIterating: (
        prompt: string,
        parentPresentationId: number,
        slideCount: number,
        detailLevel: string,
        tonality: string,
        researchEnabled?: boolean,
    ) => Promise<boolean>;
    stopStreaming: () => void;
    resetStreaming: () => void;
    getPresentation: () => PresentationData | null;
}

const initialState: StreamingState = {
    isStreaming: false,
    slides: [],
    theme: "default",
    title: "Untitled Presentation",
    totalSlides: 0,
    isComplete: false,
    researchSummary: undefined,
    researchSources: undefined,
    researchStatus: "idle",
};

const StreamingContext = createContext<StreamingContextValue | null>(null);

function publishPointsBalance(slideTokens: unknown) {
    if (typeof slideTokens !== "number" || !Number.isFinite(slideTokens)) return;
    window.dispatchEvent(
        new CustomEvent("slide-sage:points-updated", {
            detail: { slideTokens },
        }),
    );
}

export function StreamingProvider({ children }: { children: ReactNode }) {
    const [streamingState, setStreamingState] = useState<StreamingState>(initialState);
    const abortControllerRef = useRef<AbortController | null>(null);
    const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

    const resetStreaming = useCallback(() => {
        setStreamingState(initialState);
    }, []);

    const stopStreaming = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        if (readerRef.current) {
            readerRef.current.cancel();
            readerRef.current = null;
        }
        setStreamingState((prev) => ({ ...prev, isStreaming: false }));
    }, []);

    const getPresentation = useCallback((): PresentationData | null => {
        if (streamingState.slides.length === 0) return null;
        return {
            title: streamingState.title,
            theme: streamingState.theme,
            slides: streamingState.slides,
            totalSlides: streamingState.slides.length,
        };
    }, [streamingState]);

    const startStreaming = useCallback(
        async (
            prompt: string,
            slideCount: number,
            detailLevel: string,
            tonality: string,
            researchEnabled = false,
            researchPayload?: ResearchPayload,
        ): Promise<boolean> => {
            // Reset state
            setStreamingState({
                ...initialState,
                isStreaming: true,
                researchStatus: researchEnabled && !researchPayload ? "searching" : "idle",
            });

            abortControllerRef.current = new AbortController();

            try {
                const response = await fetch(`${API_URL}/api/generate-presentation-stream`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        topic: prompt,
                        slide_count: slideCount,
                        detail_level: detailLevel,
                        tonality,
                        research: {
                            enabled: Boolean(researchEnabled),
                        },
                        research_payload: researchPayload,
                    }),
                    signal: abortControllerRef.current.signal,
                });

                // Handle 401 Unauthorized - token might be expired
                if (response.status === 401) {
                    setStreamingState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: "Session expired. Please log in again.",
                    }));
                    return false;
                }

                if (response.status === 422) {
                    setStreamingState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: "Your session is invalid. Please log out and log in again.",
                    }));
                    return false;
                }

                if (response.status === 402) {
                    const errorData = await response.json();
                    setStreamingState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: `Insufficient points. You have ${
                            errorData.slide_tokens_remaining?.toFixed(1) || 0
                        } points, but need at least ${
                            errorData.slide_tokens_required || 1
                        } to generate.`,
                    }));
                    return false;
                }

                if (!response.ok) {
                    const errorData = await response.json();
                    const errorMessage =
                        typeof errorData.error === "string"
                            ? errorData.error
                            : errorData.error?.message ||
                              errorData.message ||
                              "Failed to generate presentation";

                    setStreamingState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: errorMessage,
                    }));
                    return false;
                }

                const reader = response.body?.getReader();
                if (!reader) {
                    setStreamingState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: "Failed to read streaming response",
                    }));
                    return false;
                }

                readerRef.current = reader;
                const decoder = new TextDecoder();
                let buffer = "";
                let currentEvent = ""; // Persist across reads

                const processStream = async () => {
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split("\n");
                            buffer = lines.pop() || "";

                            for (const line of lines) {
                                if (line.startsWith("event: ")) {
                                    currentEvent = line.slice(7).trim();
                                } else if (line.startsWith("data: ") && currentEvent) {
                                    const dataStr = line.slice(6);
                                    try {
                                        const data = JSON.parse(dataStr);

                                        switch (currentEvent) {
                                            case "start":
                                                setStreamingState((prev) => ({
                                                    ...prev,
                                                    researchStatus:
                                                        prev.researchStatus &&
                                                        prev.researchStatus !== "idle"
                                                            ? "generating"
                                                            : prev.researchStatus,
                                                }));
                                                break;

                                            case "research":
                                                setStreamingState((prev) => ({
                                                    ...prev,
                                                    researchStatus:
                                                        data.status || prev.researchStatus,
                                                    researchSources:
                                                        data.sources ?? prev.researchSources,
                                                    researchSummary:
                                                        data.summary ?? prev.researchSummary,
                                                }));
                                                break;

                                            case "midwayspace":
                                                setStreamingState((prev) => ({
                                                    ...prev,
                                                    researchSummary:
                                                        data.summary ?? prev.researchSummary,
                                                    researchSources:
                                                        data.sources ?? prev.researchSources,
                                                    researchStatus: "ready",
                                                }));
                                                break;

                                            case "created":
                                                // Presentation record created - store the ID immediately
                                                setStreamingState((prev) => ({
                                                    ...prev,
                                                    presentationId: data.presentation_id,
                                                }));
                                                break;

                                            case "theme":
                                                setStreamingState((prev) => ({
                                                    ...prev,
                                                    theme: data.theme,
                                                }));
                                                break;

                                            case "slide":
                                                setStreamingState((prev) => {
                                                    const newSlides = [...prev.slides, data.slide];
                                                    console.log(
                                                        "Adding slide",
                                                        data.slide.id,
                                                        "Total slides:",
                                                        newSlides.length,
                                                    );
                                                    return {
                                                        ...prev,
                                                        slides: newSlides,
                                                        title: data.title || prev.title,
                                                        totalSlides: newSlides.length,
                                                    };
                                                });
                                                break;

                                            case "complete":
                                                setStreamingState((prev) => ({
                                                    ...prev,
                                                    isComplete: true,
                                                    theme: data.theme || prev.theme,
                                                    title: data.title || prev.title,
                                                    slides: data.slides || prev.slides,
                                                    totalSlides:
                                                        data.totalSlides ||
                                                        (data.slides
                                                            ? data.slides.length
                                                            : prev.slides.length),
                                                }));
                                                break;

                                            case "saved":
                                                // Final save confirmation - update presentation ID if provided
                                                setStreamingState((prev) => ({
                                                    ...prev,
                                                    presentationId:
                                                        data.presentation_id || prev.presentationId,
                                                }));
                                                console.log(
                                                    "Presentation saved:",
                                                    data.presentation_id,
                                                );
                                                publishPointsBalance(
                                                    data.slide_tokens_remaining,
                                                );
                                                break;

                                            case "save_error":
                                                console.error("Save error:", data.error);
                                                // Don't set streaming to false, just log the error
                                                break;

                                            case "error":
                                                setStreamingState((prev) => ({
                                                    ...prev,
                                                    isStreaming: false,
                                                    error: data.error,
                                                    researchStatus: "idle",
                                                }));
                                                return;
                                        }

                                        // Reset event after processing
                                        currentEvent = "";
                                    } catch (parseErr) {
                                        console.error("Failed to parse SSE data:", parseErr);
                                    }
                                }
                            }
                        }

                        // Stream complete
                        setStreamingState((prev) => ({
                            ...prev,
                            isStreaming: false,
                            isComplete: true,
                            researchStatus:
                                prev.researchStatus === "generating"
                                    ? "ready"
                                    : prev.researchStatus,
                        }));
                    } catch (streamErr: unknown) {
                        const isAbort =
                            streamErr instanceof Error && streamErr.name === "AbortError";
                        if (!isAbort) {
                            console.error("Stream error:", streamErr);
                            const message =
                                streamErr instanceof Error ? streamErr.message : String(streamErr);
                            setStreamingState((prev) => ({
                                ...prev,
                                isStreaming: false,
                                error: `Streaming error: ${message}`,
                            }));
                        }
                    }
                };

                // Start processing the stream in the background
                processStream();
                return true;
            } catch (err: unknown) {
                const isAbort = err instanceof Error && err.name === "AbortError";
                if (!isAbort) {
                    const message = err instanceof Error ? err.message : String(err);
                    setStreamingState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: `Error: ${message}`,
                    }));
                }
                return false;
            }
        },
        [],
    );

    const startIterating = useCallback(
        async (
            prompt: string,
            parentPresentationId: number,
            slideCount: number,
            detailLevel: string,
            tonality: string,
            researchEnabled = false,
        ): Promise<boolean> => {
            // Reset state
            setStreamingState({
                ...initialState,
                isStreaming: true,
                researchStatus: researchEnabled ? "searching" : "idle",
            });

            abortControllerRef.current = new AbortController();

            try {
                const response = await fetch(`${API_URL}/api/iterate-presentation-stream`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        topic: prompt,
                        parent_presentation_id: parentPresentationId,
                        slide_count: slideCount,
                        detail_level: detailLevel,
                        tonality,
                        research: {
                            enabled: Boolean(researchEnabled),
                        },
                    }),
                    signal: abortControllerRef.current.signal,
                });

                // Handle 401 Unauthorized - token might be expired
                if (response.status === 401) {
                    setStreamingState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: "Session expired. Please log in again.",
                    }));
                    return false;
                }

                if (response.status === 422) {
                    setStreamingState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: "Your session is invalid. Please log out and log in again.",
                    }));
                    return false;
                }

                if (response.status === 402) {
                    const errorData = await response.json();
                    setStreamingState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: `Insufficient points. You have ${
                            errorData.slide_tokens_remaining?.toFixed(1) || 0
                        } points, but need at least ${
                            errorData.slide_tokens_required || 1
                        } to iterate.`,
                    }));
                    return false;
                }

                if (!response.ok) {
                    const errorData = await response.json();
                    const errorMessage =
                        typeof errorData.error === "string"
                            ? errorData.error
                            : errorData.error?.message ||
                              errorData.message ||
                              "Failed to iterate presentation";
                    setStreamingState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: errorMessage,
                    }));
                    return false;
                }

                const reader = response.body?.getReader();
                if (!reader) {
                    setStreamingState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: "Failed to read streaming response",
                    }));
                    return false;
                }

                readerRef.current = reader;
                const decoder = new TextDecoder();
                let buffer = "";
                let currentEvent = ""; // Persist across reads

                const processStream = async () => {
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split("\n");
                            buffer = lines.pop() || "";

                            for (const line of lines) {
                                if (line.startsWith("event: ")) {
                                    currentEvent = line.slice(7).trim();
                                } else if (line.startsWith("data: ") && currentEvent) {
                                    const dataStr = line.slice(6);
                                    try {
                                        const data = JSON.parse(dataStr);

                                        switch (currentEvent) {
                                            case "start":
                                                setStreamingState((prev) => ({
                                                    ...prev,
                                                    researchStatus:
                                                        prev.researchStatus &&
                                                        prev.researchStatus !== "idle"
                                                            ? "generating"
                                                            : prev.researchStatus,
                                                }));
                                                break;

                                            case "research":
                                                setStreamingState((prev) => ({
                                                    ...prev,
                                                    researchStatus:
                                                        data.status || prev.researchStatus,
                                                    researchSources:
                                                        data.sources ?? prev.researchSources,
                                                    researchSummary:
                                                        data.summary ?? prev.researchSummary,
                                                }));
                                                break;

                                            case "midwayspace":
                                                setStreamingState((prev) => ({
                                                    ...prev,
                                                    researchSummary:
                                                        data.summary ?? prev.researchSummary,
                                                    researchSources:
                                                        data.sources ?? prev.researchSources,
                                                    researchStatus: "ready",
                                                }));
                                                break;

                                            case "theme":
                                                setStreamingState((prev) => ({
                                                    ...prev,
                                                    theme: data.theme,
                                                }));
                                                break;

                                            case "slide":
                                                setStreamingState((prev) => {
                                                    const newSlides = [...prev.slides, data.slide];
                                                    console.log(
                                                        "Adding slide",
                                                        data.slide.id,
                                                        "Total slides:",
                                                        newSlides.length,
                                                    );
                                                    return {
                                                        ...prev,
                                                        slides: newSlides,
                                                        title: data.title || prev.title,
                                                        totalSlides: newSlides.length,
                                                    };
                                                });
                                                break;

                                            case "complete":
                                                setStreamingState((prev) => ({
                                                    ...prev,
                                                    isComplete: true,
                                                    theme: data.theme || prev.theme,
                                                    title: data.title || prev.title,
                                                    // Use complete slides data if available to ensure consistency
                                                    slides: data.slides || prev.slides,
                                                    totalSlides:
                                                        data.totalSlides ||
                                                        (data.slides
                                                            ? data.slides.length
                                                            : prev.slides.length),
                                                }));
                                                break;

                                            case "saved":
                                                // Iteration saved - presentation updated in place
                                                setStreamingState((prev) => ({
                                                    ...prev,
                                                    presentationId:
                                                        data.presentation_id || prev.presentationId,
                                                }));
                                                console.log(
                                                    "Iteration saved to presentation:",
                                                    data.presentation_id,
                                                );
                                                publishPointsBalance(
                                                    data.slide_tokens_remaining,
                                                );
                                                break;

                                            case "save_error":
                                                console.error(
                                                    "Save error during iteration:",
                                                    data.error,
                                                );
                                                break;

                                            case "error":
                                                setStreamingState((prev) => ({
                                                    ...prev,
                                                    isStreaming: false,
                                                    error: data.error,
                                                    researchStatus: "idle",
                                                }));
                                                return;
                                        }

                                        // Reset event after processing
                                        currentEvent = "";
                                    } catch (parseErr) {
                                        console.error("Failed to parse SSE data:", parseErr);
                                    }
                                }
                            }
                        }

                        // Stream complete
                        setStreamingState((prev) => ({
                            ...prev,
                            isStreaming: false,
                            isComplete: true,
                            researchStatus:
                                prev.researchStatus === "generating"
                                    ? "ready"
                                    : prev.researchStatus,
                        }));
                    } catch (streamErr: unknown) {
                        const isAbort =
                            streamErr instanceof Error && streamErr.name === "AbortError";
                        if (!isAbort) {
                            console.error("Stream error:", streamErr);
                            const message =
                                streamErr instanceof Error ? streamErr.message : String(streamErr);
                            setStreamingState((prev) => ({
                                ...prev,
                                isStreaming: false,
                                error: `Streaming error: ${message}`,
                            }));
                        }
                    }
                };

                // Start processing the stream in the background
                processStream();
                return true;
            } catch (err: unknown) {
                const isAbort = err instanceof Error && err.name === "AbortError";
                if (!isAbort) {
                    const message = err instanceof Error ? err.message : String(err);
                    setStreamingState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: `Error: ${message}`,
                    }));
                }
                return false;
            }
        },
        [],
    );

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopStreaming();
        };
    }, [stopStreaming]);

    return (
        <StreamingContext.Provider
            value={{
                streamingState,
                startStreaming,
                startIterating,
                stopStreaming,
                resetStreaming,
                getPresentation,
            }}
        >
            {children}
        </StreamingContext.Provider>
    );
}

export function useStreaming() {
    const context = useContext(StreamingContext);
    if (!context) {
        throw new Error("useStreaming must be used within a StreamingProvider");
    }
    return context;
}
