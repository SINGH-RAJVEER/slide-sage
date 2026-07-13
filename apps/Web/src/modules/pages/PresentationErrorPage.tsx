import { ArrowLeft, CircleAlert, Trash2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api";
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

    const presentationId = location.state?.presentationId || propPresentationId;
    const error =
        location.state?.error ||
        propError ||
        "This presentation has no content or failed to generate.";

    const handleGoHome = () => {
        navigate(ROUTES.presentations);
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
                        <CircleAlert className="h-4 w-4" aria-hidden="true" />
                        <span>Generation stopped</span>
                    </div>

                    <div className="mt-5 max-w-2xl">
                        <h1
                            id="presentation-error-title"
                            className="text-3xl font-semibold text-white md:text-4xl"
                        >
                            We couldn&apos;t finish this presentation
                        </h1>
                        <p className="mt-4 text-base leading-7 text-white/60 md:text-lg">{error}</p>
                    </div>

                    <div className="mt-10 rounded-lg border border-white/10 bg-black/20 p-5 md:p-6">
                        <h2 className="text-sm font-semibold text-white/90">What you can do</h2>
                        <ul className="mt-4 grid gap-3 text-sm leading-6 text-white/55 md:grid-cols-2">
                            <li className="flex gap-3">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" />
                                Return to your presentations and try generating the deck again.
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
                                Remove the unfinished presentation if you no longer need it.
                            </li>
                        </ul>
                    </div>

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Button
                            onClick={handleGoHome}
                            className="h-11 bg-white px-5 text-[#151c2a] hover:bg-white/90"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            My Presentations
                        </Button>

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
                </section>
            </main>
        </div>
    );
}
