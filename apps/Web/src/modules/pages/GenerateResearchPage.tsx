import { ArrowLeft, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { API_URL } from "@/lib/api";
import { useStreaming } from "@/modules/presentations";
import type { ResearchPayload, Source } from "@/modules/types/presentation";
import { ROUTES } from "@/router/paths";

interface ResearchRouteState {
    prompt: string;
    slideCount: number;
    detailLevel: string;
    tonality: string;
}

type ResearchStatus = "loading" | "ready" | "error";

export default function GenerateResearchPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { streamingState, startStreaming } = useStreaming();

    const routeState = location.state as ResearchRouteState | null;
    const prompt = routeState?.prompt?.trim() ?? "";
    const slideCount = routeState?.slideCount ?? 0;
    const detailLevel = routeState?.detailLevel ?? "balanced";
    const tonality = routeState?.tonality ?? "professional";

    const [sources, setSources] = useState<Source[]>([]);
    const [researchStatus, setResearchStatus] = useState<ResearchStatus>("loading");
    const [error, setError] = useState("");
    const [isProceeding, setIsProceeding] = useState(false);
    const [researchAttempt, setResearchAttempt] = useState(0);
    const requestIdRef = useRef(0);

    const hasSources = sources.length > 0;
    const isLoading = researchStatus === "loading";

    const getSourceLabel = (url: string) => {
        try {
            return new URL(url).hostname;
        } catch {
            return url;
        }
    };

    useEffect(() => {
        if (!prompt || !slideCount) {
            navigate(ROUTES.generate);
        }
    }, [navigate, prompt, slideCount]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: researchAttempt intentionally retriggers failed requests.
    useEffect(() => {
        const controller = new AbortController();
        const requestId = ++requestIdRef.current;

        const fetchResearch = async () => {
            if (!prompt || !slideCount) return;

            setResearchStatus("loading");
            setError("");
            setSources([]);

            try {
                const response = await fetch(`${API_URL}/api/research-presentation`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        topic: prompt,
                        research: {
                            enabled: true,
                        },
                    }),
                    signal: controller.signal,
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    const errorMessage =
                        typeof errorData.error === "string"
                            ? errorData.error
                            : errorData.error?.message ||
                              errorData.message ||
                              "Failed to fetch research";
                    if (controller.signal.aborted || requestId !== requestIdRef.current) return;
                    setError(errorMessage);
                    setResearchStatus("error");
                    return;
                }

                const data = (await response.json()) as ResearchPayload;
                if (controller.signal.aborted || requestId !== requestIdRef.current) return;

                setSources(Array.isArray(data.sources) ? data.sources : []);
                setResearchStatus("ready");
            } catch (err: unknown) {
                if (
                    controller.signal.aborted ||
                    requestId !== requestIdRef.current ||
                    (err instanceof Error && err.name === "AbortError")
                ) {
                    return;
                }
                const message = err instanceof Error ? err.message : String(err);
                setError(message);
                setResearchStatus("error");
            }
        };

        fetchResearch();
        return () => controller.abort();
    }, [prompt, slideCount, researchAttempt]);

    useEffect(() => {
        if (isProceeding && streamingState.slides.length >= 1) {
            navigate(ROUTES.presentation, { state: { isStreaming: true } });
        }
    }, [isProceeding, navigate, streamingState.slides.length]);

    const handleProceed = async () => {
        if (!prompt || !slideCount || streamingState.isStreaming) return;

        setIsProceeding(true);
        setError("");

        const payload: ResearchPayload = {
            sources,
        };

        const success = await startStreaming(
            prompt,
            slideCount,
            detailLevel,
            tonality,
            false,
            payload,
        );

        if (!success) {
            setIsProceeding(false);
        }
    };

    return (
        <div className="h-screen overflow-hidden bg-transparent flex flex-col">
            <Header />
            <div className="flex-1 overflow-y-auto relative">
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="absolute left-4 top-4 z-10 rounded-md p-2 text-white/60 transition-colors hover:bg-white/5 hover:text-white md:left-8 md:top-8"
                    aria-label="Go back"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>

                <div className="mx-auto w-full max-w-4xl px-4 py-12 md:px-6">
                    <div className="space-y-8">
                        <div className="text-center">
                            <h2 className="text-3xl font-semibold text-white md:text-4xl">
                                Research Insights
                            </h2>
                        </div>

                        {researchStatus === "error" && (
                            <div className="flex flex-col items-center gap-4 rounded-lg border border-red-500/20 bg-red-500/10 px-6 py-5 text-center text-red-200">
                                <p>{error}</p>
                                <Button
                                    type="button"
                                    onClick={() => setResearchAttempt((attempt) => attempt + 1)}
                                    className="h-10 rounded-md border border-red-200/20 bg-transparent px-4 text-red-100 hover:bg-red-200/10"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    Retry research
                                </Button>
                            </div>
                        )}

                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="flex items-center gap-2 text-xl font-semibold text-white/90">
                                    Sources
                                    {isLoading && <Spinner className="text-white/50" />}
                                </h3>
                                {hasSources && (
                                    <span className="text-sm text-white/45">
                                        {sources.length}{" "}
                                        {sources.length === 1 ? "source" : "sources"}
                                    </span>
                                )}
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                {hasSources &&
                                    sources.map((source) => (
                                        <a
                                            key={source.url}
                                            href={source.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group flex min-w-0 flex-col rounded-lg border border-white/10 bg-black/20 p-5 transition-colors hover:border-white/20 hover:bg-white/5"
                                        >
                                            <div className="mb-3 flex items-start justify-between gap-3">
                                                <h4 className="text-base font-medium leading-snug text-white/90 transition-colors group-hover:text-white">
                                                    {source.title || getSourceLabel(source.url)}
                                                </h4>
                                                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-white/35 transition-colors group-hover:text-white/70" />
                                            </div>
                                            <p className="mb-4 whitespace-pre-line text-sm leading-relaxed text-white/65">
                                                {source.summary ||
                                                    source.snippet ||
                                                    "No preview available for this source."}
                                            </p>
                                            {source.highlights && source.highlights.length > 0 && (
                                                <ul className="mb-4 space-y-2 text-sm leading-relaxed text-white/55">
                                                    {source.highlights.map((highlight) => (
                                                        <li key={highlight} className="flex gap-2">
                                                            <span className="text-white/30">-</span>
                                                            <span>{highlight}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-3 text-xs text-white/35">
                                                <span>{getSourceLabel(source.url)}</span>
                                                {source.author && <span>{source.author}</span>}
                                                {source.published_date && (
                                                    <span>{source.published_date}</span>
                                                )}
                                            </div>
                                        </a>
                                    ))}

                                {researchStatus === "ready" && !hasSources && (
                                    <div className="md:col-span-2 rounded-lg border border-white/10 bg-black/10 p-6 text-center text-white/45">
                                        No sources found. Try a different phrasing or a broader
                                        topic.
                                    </div>
                                )}

                                {isLoading &&
                                    sources.length === 0 &&
                                    [1, 2, 3, 4].map((i) => (
                                        <div
                                            key={i}
                                            className="animate-pulse rounded-lg border border-white/10 bg-black/10 p-6"
                                        >
                                            <div className="h-6 w-3/4 bg-white/5 rounded mb-4" />
                                            <div className="h-4 w-full bg-white/5 rounded mb-2" />
                                            <div className="h-4 w-2/3 bg-white/5 rounded" />
                                        </div>
                                    ))}
                            </div>
                        </div>

                        <div className="flex justify-center pt-2 pb-6">
                            <Button
                                onClick={handleProceed}
                                disabled={
                                    researchStatus !== "ready" ||
                                    isProceeding ||
                                    streamingState.isStreaming
                                }
                                className="group h-11 rounded-md border border-white/20 bg-white/10 px-6 text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    {isProceeding ? (
                                        <>
                                            <Spinner />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-4 w-4 opacity-80" />
                                            Proceed to Generate
                                        </>
                                    )}
                                </span>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
