import { AlertCircle, ArrowUpRight, Check, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStreaming } from "@/modules/contexts/StreamingContext";
import { ROUTES } from "@/router/paths";

type GenerationStatus = "active" | "complete" | "error";

interface GenerationStatusIndicatorViewProps {
    status: GenerationStatus;
    title: string;
    detail: string;
    progress?: number;
    onActivate: () => void;
}

const STATUS_STYLES: Record<GenerationStatus, string> = {
    active: "border-sky-300/25 bg-[hsl(222,27%,12%)] text-sky-100 hover:border-sky-200/45",
    complete:
        "border-emerald-300/25 bg-[hsl(222,27%,12%)] text-emerald-100 hover:border-emerald-200/45",
    error: "border-red-300/25 bg-[hsl(222,27%,12%)] text-red-100 hover:border-red-200/45",
};

export function GenerationStatusIndicatorView({
    status,
    title,
    detail,
    progress,
    onActivate,
}: GenerationStatusIndicatorViewProps) {
    const Icon = status === "active" ? LoaderCircle : status === "complete" ? Check : AlertCircle;
    const normalizedProgress = Math.max(0, Math.min(progress ?? 0, 1));

    return (
        <button
            type="button"
            onClick={onActivate}
            className={`group fixed bottom-4 left-4 z-50 flex min-h-16 w-[calc(100vw-2rem)] max-w-sm items-center gap-3 rounded-lg border px-4 py-3 text-left shadow-2xl transition-colors sm:left-auto sm:right-5 ${STATUS_STYLES[status]}`}
            aria-label={`${title}. ${detail}`}
        >
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white/8">
                <Icon
                    className={`h-5 w-5 ${status === "active" ? "animate-spin motion-reduce:animate-none" : ""}`}
                    aria-hidden="true"
                />
            </span>

            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{title}</span>
                <span className="mt-0.5 block truncate text-xs text-white/60">{detail}</span>
                {status === "active" ? (
                    <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/10">
                        <span
                            className="block h-full origin-left rounded-full bg-sky-300 transition-transform duration-500 motion-reduce:transition-none"
                            style={{ transform: `scaleX(${normalizedProgress})` }}
                        />
                    </span>
                ) : null}
            </span>

            <ArrowUpRight
                className="h-4 w-4 flex-none text-white/45 transition-colors group-hover:text-white/80"
                aria-hidden="true"
            />
        </button>
    );
}

export default function GenerationStatusIndicator() {
    const { streamingState } = useStreaming();
    const location = useLocation();
    const navigate = useNavigate();
    const [dismissedCompletion, setDismissedCompletion] = useState<string | null>(null);

    const isIteration = streamingState.operation === "iteration";
    const activePath =
        isIteration && streamingState.presentationId
            ? ROUTES.presentationById(streamingState.presentationId)
            : ROUTES.presentation;
    const completedPath = streamingState.presentationId
        ? ROUTES.presentationById(streamingState.presentationId)
        : ROUTES.presentations;
    const completionKey = streamingState.presentationId
        ? `${streamingState.presentationId}:${streamingState.slides.length}`
        : null;

    if (streamingState.isStreaming) {
        if (location.pathname === activePath) return null;

        const generatedSlides = streamingState.slides.length;
        const requestedSlides = streamingState.requestedSlides;
        const progress = requestedSlides > 0 ? generatedSlides / requestedSlides : 0;
        const detail =
            generatedSlides > 0 && requestedSlides > 0
                ? `${generatedSlides} of ${requestedSlides} slides ready`
                : streamingState.prompt || "Preparing your presentation";

        return (
            <GenerationStatusIndicatorView
                status="active"
                title={isIteration ? "Updating presentation" : "Generating presentation"}
                detail={detail}
                progress={progress}
                onActivate={() =>
                    navigate(activePath, {
                        state: {
                            isStreaming: true,
                            presentationId: streamingState.presentationId,
                        },
                    })
                }
            />
        );
    }

    if (
        streamingState.isComplete &&
        completionKey &&
        dismissedCompletion !== completionKey &&
        location.pathname !== completedPath
    ) {
        return (
            <GenerationStatusIndicatorView
                status="complete"
                title="Presentation ready"
                detail="Saved to Presentations"
                onActivate={() => {
                    setDismissedCompletion(completionKey);
                    navigate(completedPath, {
                        state: {
                            presentation: {
                                title: streamingState.title,
                                theme: streamingState.theme,
                                slides: streamingState.slides,
                                totalSlides: streamingState.slides.length,
                            },
                            presentationId: streamingState.presentationId,
                            isNewGeneration: true,
                        },
                    });
                }}
            />
        );
    }

    if (streamingState.error && location.pathname !== ROUTES.presentationError) {
        return (
            <GenerationStatusIndicatorView
                status="error"
                title="Generation stopped"
                detail={streamingState.error}
                onActivate={() =>
                    navigate(ROUTES.presentationError, {
                        state: {
                            error: streamingState.error,
                            presentationId: streamingState.presentationId,
                        },
                    })
                }
            />
        );
    }

    return null;
}
