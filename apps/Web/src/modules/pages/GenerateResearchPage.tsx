import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { getApiBaseUrl } from "@/lib/utils";
import { useStreaming } from "@/modules/presentations";
import type { ResearchPayload, Source } from "@/modules/types/presentation";
import { ROUTES } from "@/router/paths";

const API_URL = getApiBaseUrl(import.meta.env.VITE_API_URL);

interface ResearchRouteState {
  prompt: string;
  slideCount: number;
  detailLevel: string;
  tonality: string;
}

export default function GenerateResearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { streamingState, startStreaming, resetStreaming } = useStreaming();

  const routeState = location.state as ResearchRouteState | null;
  const prompt = routeState?.prompt?.trim() ?? "";
  const slideCount = routeState?.slideCount ?? 0;
  const detailLevel = routeState?.detailLevel ?? "balanced";
  const tonality = routeState?.tonality ?? "professional";

  const [summary, setSummary] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [tokensUsed, setTokensUsed] = useState<number | null>(null);
  const [tokensEstimated, setTokensEstimated] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isProceeding, setIsProceeding] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);

  const hasSummary = Boolean(summary && summary.trim().length > 0);
  const summaryLines =
    hasSummary && summary
      ? summary.split("\n").filter((line) => line.trim().length > 0)
      : [];

  const visibleSources = showAllSources ? sources : sources.slice(0, 4);
  const hasSources = sources.length > 0;

  const getSourceLabel = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  useEffect(() => {
    resetStreaming();
  }, [resetStreaming]);

  useEffect(() => {
    if (!prompt || !slideCount) {
      navigate(ROUTES.generate);
    }
  }, [navigate, prompt, slideCount]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchResearch = async () => {
      if (!prompt || !slideCount) return;

      setLoading(true);
      setError("");
      setShowAllSources(false);
      setTokensUsed(null);
      setTokensEstimated(null);

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
          setError(errorMessage);
          setLoading(false);
          return;
        }

        const data = (await response.json()) as ResearchPayload & {
          tokens_used?: number;
          tokens_estimated?: number;
        };
        setSummary(typeof data.summary === "string" ? data.summary : null);
        setSources(Array.isArray(data.sources) ? data.sources : []);
        setTokensUsed(
          typeof data.tokens_used === "number" ? data.tokens_used : null,
        );
        setTokensEstimated(
          typeof data.tokens_estimated === "number"
            ? data.tokens_estimated
            : null,
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchResearch();
    return () => controller.abort();
  }, [prompt, slideCount]);

  useEffect(() => {
    if (isProceeding && streamingState.slides.length >= 1) {
      navigate(ROUTES.presentation, { state: { isStreaming: true } });
    }
  }, [isProceeding, navigate, streamingState.slides.length]);

  const handleProceed = async () => {
    if (!prompt || !slideCount) return;

    setIsProceeding(true);
    setError("");

    const payload: ResearchPayload = {
      summary,
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

            {/* Error State */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-200 px-8 py-6 rounded-2xl backdrop-blur-sm text-center font-light text-lg">
                {error}
              </div>
            )}

            {/* Main Content Grid */}
            <div className="space-y-6">
              <div className="space-y-5 rounded-xl border border-white/10 bg-black/20 p-6 md:p-8">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <h3 className="flex items-center gap-2 text-xl font-semibold text-white/90">
                    Synopsis
                    {loading && (
                      <Loader2 className="h-4 w-4 animate-spin text-white/50" />
                    )}
                  </h3>
                </div>

                {(tokensUsed !== null || tokensEstimated !== null) && (
                  <p className="text-sm font-light text-white/40">
                    Search tokens: {tokensUsed !== null ? tokensUsed : "?"} used{" "}
                    / {tokensEstimated !== null ? tokensEstimated : "?"} est
                  </p>
                )}

                {hasSummary ? (
                  <div className="space-y-3 text-base leading-relaxed text-white/80">
                    {summaryLines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                ) : (
                  <div className="text-base text-white/45 italic">
                    {loading
                      ? "Synthesizing research data..."
                      : "No summary available."}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-white/90">
                    Sources
                  </h3>
                  {sources.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setShowAllSources((prev) => !prev)}
                      className="text-sm text-white/50 hover:text-white/80 transition-colors"
                    >
                      {showAllSources
                        ? "Show less"
                        : `Show all (${sources.length})`}
                    </button>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {hasSources &&
                    visibleSources.map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group rounded-lg border border-white/10 bg-black/20 p-5 transition-colors hover:bg-white/5"
                      >
                        <h4 className="mb-2 line-clamp-1 text-base font-medium text-white/90 transition-colors group-hover:text-white">
                          {source.title || getSourceLabel(source.url)}
                        </h4>
                        <p className="mb-4 line-clamp-2 text-sm text-white/60">
                          {source.snippet ||
                            "No preview available for this source."}
                        </p>
                        <p className="text-xs text-white/30 truncate">
                          {source.url}
                        </p>
                      </a>
                    ))}

                  {!loading && !hasSources && (
                    <div className="md:col-span-2 rounded-lg border border-white/10 bg-black/10 p-6 text-center text-white/45">
                      No sources found. Try a different phrasing or a broader
                      topic.
                    </div>
                  )}

                  {loading &&
                    sources.length === 0 &&
                    [1, 2].map((i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-white/10 bg-black/10 p-6 animate-pulse"
                      >
                        <div className="h-6 w-3/4 bg-white/5 rounded mb-4" />
                        <div className="h-4 w-full bg-white/5 rounded mb-2" />
                        <div className="h-4 w-2/3 bg-white/5 rounded" />
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="flex justify-center pt-2 pb-6">
              <Button
                onClick={handleProceed}
                disabled={loading || isProceeding || Boolean(error)}
                className="group h-11 rounded-md border border-white/20 bg-white/10 px-6 text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {isProceeding ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
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
