import type { ApiErrorResponse, PresentationResponse } from "@slidesage/types";
import { Button } from "@slidesage/ui/components/button";
import { Spinner } from "@slidesage/ui/components/spinner";
import { CircleAlert, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { API_URL, readJsonResponse } from "@/lib/api";
import { getPresentationRetryDestination } from "@/lib/presentation-retry";
import Header from "@/modules/Header";
import { ROUTES } from "@/router/paths";

interface PresentationErrorPageProps {
    presentationId?: number | string;
    error?: string;
    onDelete?: () => void;
}

export default function PresentationErrorPage({
    presentationId: propPresentationId,
    error: propError,
    onDelete,
}: PresentationErrorPageProps = {}) {
    const navigate = useNavigate();
    const location = useLocation();
    const [isRetrying, setIsRetrying] = useState(false);
    const [retryError, setRetryError] = useState("");

    const presentationId = location.state?.presentationId || propPresentationId;
    const error =
        location.state?.error ||
        propError ||
        "This presentation has no content or failed to generate.";
    const StatusIcon = presentationId ? RotateCcw : CircleAlert;

    const handleRetry = async () => {
        if (!presentationId || isRetrying) return;

        setIsRetrying(true);
        setRetryError("");

        try {
            const response = await fetch(`${API_URL}/api/presentations/${presentationId}`, {
                credentials: "include",
            });
            const result = await readJsonResponse<PresentationResponse | ApiErrorResponse>(
                response,
            );

            if (response.status === 401) {
                setRetryError("Your session expired. Please sign in again.");
                return;
            }

            if (!result) {
                setRetryError("The presentation service returned an invalid response. Try again.");
                return;
            }

            if (!response.ok || "error" in result) {
                const message = "error" in result ? result.error.message : undefined;
                setRetryError(message || "Unable to open this retry.");
                return;
            }

            const destination = getPresentationRetryDestination(
                result.presentation.slides_data,
                result.presentation.id,
            );
            if (!destination) {
                setRetryError("The saved retry settings are unavailable.");
                return;
            }

            navigate(destination.to, { state: destination.state });
        } catch (retryRequestError) {
            setRetryError(
                retryRequestError instanceof Error
                    ? retryRequestError.message
                    : "Unable to open this retry.",
            );
        } finally {
            setIsRetrying(false);
        }
    };

    const handleDelete = async () => {
        if (onDelete) {
            onDelete();
        } else if (presentationId) {
            try {
                const response = await fetch(`${API_URL}/api/presentations/${presentationId}`, {
                    method: "DELETE",
                    credentials: "include",
                });

                if (response.ok) {
                    navigate(ROUTES.presentations);
                }
            } catch (err) {
                console.error("Failed to delete presentation:", err);
            }
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-transparent">
            <Header />
            <main className="flex flex-1 items-center px-6 py-12 md:px-10 md:py-16">
                <section
                    aria-labelledby="presentation-error-title"
                    className="mx-auto w-full max-w-3xl"
                >
                    <div className="flex items-center gap-2 text-sm font-medium text-red-300">
                        <StatusIcon className="h-4 w-4" aria-hidden="true" />
                        <span>{presentationId ? "Saved for retry" : "Generation unavailable"}</span>
                    </div>

                    <div className="mt-5 max-w-2xl">
                        <h1
                            id="presentation-error-title"
                            className="text-3xl font-semibold text-white md:text-4xl"
                        >
                            We couldn&apos;t finish this presentation
                        </h1>
                        <p className="mt-4 text-base leading-7 text-white/60 md:text-lg">{error}</p>
                        {presentationId && (
                            <p className="mt-3 text-sm leading-6 text-white/45">
                                Your prompt, generation settings, and available research sources are
                                saved with this presentation.
                            </p>
                        )}
                    </div>

                    <div className="mt-10 rounded-lg border border-white/10 bg-black/20 p-5 md:p-6">
                        <h2 className="text-sm font-semibold text-white/90">What you can do</h2>
                        <ul className="mt-4 grid gap-3 text-sm leading-6 text-white/55 md:grid-cols-2">
                            <li className="flex gap-3">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" />
                                Retry here with the same saved prompt and generation settings.
                            </li>
                            <li className="flex gap-3">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" />
                                Check your connection if generation stopped before any slides
                                appeared.
                            </li>
                            <li className="flex gap-3">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" />
                                Try a shorter topic or fewer slides if the request timed out.
                            </li>
                            <li className="flex gap-3">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" />
                                Remove the failed presentation if you no longer need it.
                            </li>
                        </ul>
                    </div>

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                        {presentationId && (
                            <Button
                                onClick={handleRetry}
                                disabled={isRetrying}
                                className="h-11 bg-white px-5 text-[#151c2a] hover:bg-white/90"
                            >
                                {isRetrying ? <Spinner /> : <RotateCcw className="h-4 w-4" />}
                                {isRetrying ? "Opening retry..." : "Retry presentation"}
                            </Button>
                        )}

                        {presentationId && (
                            <Button
                                onClick={handleDelete}
                                variant="ghost"
                                className="h-11 px-5 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                            >
                                <Trash2 className="h-4 w-4" />
                                Delete unfinished presentation
                            </Button>
                        )}
                    </div>

                    {retryError && (
                        <p className="mt-4 text-sm text-red-300" role="alert">
                            {retryError}
                        </p>
                    )}
                </section>
            </main>
        </div>
    );
}
