import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import {
    GridSizeControl,
    PresentationCard,
    PresentationSearchBar,
} from "@/components/Presentations";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { getApiBaseUrl } from "@/lib/utils";
import { ROUTES } from "@/router/paths";

const API_URL = getApiBaseUrl(import.meta.env.VITE_API_URL);

interface Presentation {
    id: number;
    title: string;
    prompt: string;
    created_at: string;
    updated_at: string;
}

interface SearchFilters {
    query: string;
}

export default function PresentationsGridPage() {
    const [presentations, setPresentations] = useState<Presentation[]>([]);
    const [filteredPresentations, setFilteredPresentations] = useState<Presentation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [presentationToDelete, setPresentationToDelete] = useState<number | null>(null);
    const [gridSize, setGridSize] = useState<2 | 3 | 4>(() => {
        const saved = localStorage.getItem("gridSize");
        return saved ? (parseInt(saved, 10) as 2 | 3 | 4) : 3;
    });
    const navigate = useNavigate();

    const fetchPresentations = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_URL}/api/presentations`, {
                credentials: "include",
            });

            if (response.status === 401) {
                setError("Authentication failed. Please log in again.");
                return;
            }

            const result = await response.json();

            // New API format: {presentations: [...]} or {error: {message: "..."}}
            if (result.error) {
                setError(typeof result.error === "object" ? result.error.message : result.error);
            } else {
                const presentationsList = result.presentations || [];
                setPresentations(presentationsList);
                setFilteredPresentations(presentationsList);
            }
        } catch (err) {
            setError(`Error: ${err instanceof Error ? err.message : err}`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchPresentations();
    }, [fetchPresentations]);

    useEffect(() => {
        localStorage.setItem("gridSize", gridSize.toString());
    }, [gridSize]);

    const handlePresentationClick = async (presentationId: number) => {
        try {
            const response = await fetch(`${API_URL}/api/presentations/${presentationId}`, {
                credentials: "include",
            });

            if (response.status === 401) {
                setError("Session expired. Please log in again.");
                return;
            }

            const result = await response.json();

            // New API format: {presentation: {...}} or {error: {message: "..."}}
            if (result.error) {
                setError(typeof result.error === "object" ? result.error.message : result.error);
            } else if (result.presentation) {
                navigate(ROUTES.presentationById(result.presentation.id), {
                    state: {
                        presentation: result.presentation.slides_data || result.presentation.slides,
                        presentationId: result.presentation.id,
                    },
                });
            } else {
                setError("Failed to load presentation");
            }
        } catch (err) {
            setError(`Error: ${err instanceof Error ? err.message : err}`);
        }
    };

    const handleDeletePresentation = (e: React.MouseEvent, presentationId: number) => {
        e.stopPropagation();
        setPresentationToDelete(presentationId);
    };

    const executeDelete = async () => {
        if (!presentationToDelete) return;
        const presentationId = presentationToDelete;

        try {
            setDeletingId(presentationId);
            const response = await fetch(`${API_URL}/api/presentations/${presentationId}`, {
                method: "DELETE",
                credentials: "include",
            });

            if (response.status === 401) {
                setError("Session expired. Please log in again.");
                return;
            }

            const result = await response.json();

            // New API format: {message: "..."} or {error: {message: "..."}}
            if (result.error) {
                setError(typeof result.error === "object" ? result.error.message : result.error);
            } else {
                setPresentations(presentations.filter((p) => p.id !== presentationId));
                setFilteredPresentations(
                    filteredPresentations.filter((p) => p.id !== presentationId),
                );
            }
        } catch (err) {
            setError(`Error: ${err instanceof Error ? err.message : err}`);
        } finally {
            setDeletingId(null);
            setPresentationToDelete(null);
        }
    };

    const parseDateRange = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return null;

        const fullDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (fullDateMatch) {
            const [year, month, day] = fullDateMatch.slice(1).map(Number);
            const start = new Date(year, month - 1, day, 0, 0, 0, 0);
            const end = new Date(year, month - 1, day, 23, 59, 59, 999);
            return { start, end };
        }

        const monthMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
        if (monthMatch) {
            const [year, month] = monthMatch.slice(1).map(Number);
            const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
            const end = new Date(year, month, 0, 23, 59, 59, 999);
            return { start, end };
        }

        const yearMatch = trimmed.match(/^(\d{4})$/);
        if (yearMatch) {
            const year = Number(yearMatch[1]);
            const start = new Date(year, 0, 1, 0, 0, 0, 0);
            const end = new Date(year, 11, 31, 23, 59, 59, 999);
            return { start, end };
        }

        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) {
            const start = new Date(parsed);
            start.setHours(0, 0, 0, 0);
            const end = new Date(parsed);
            end.setHours(23, 59, 59, 999);
            return { start, end };
        }

        return null;
    };

    const handleSearch = (filters: SearchFilters) => {
        const query = filters.query.trim();
        if (!query) {
            setFilteredPresentations(presentations);
            return;
        }

        const dateRange = parseDateRange(query);
        if (dateRange) {
            const filtered = presentations.filter((p) => {
                const createdDate = new Date(p.created_at);
                return createdDate >= dateRange.start && createdDate <= dateRange.end;
            });
            setFilteredPresentations(filtered);
            return;
        }

        const queryLower = query.toLowerCase();
        const filtered = presentations.filter(
            (p) =>
                p.title.toLowerCase().includes(queryLower) ||
                p.prompt.toLowerCase().includes(queryLower),
        );
        setFilteredPresentations(filtered);
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-transparent">
                <Header />
                <div className="p-4 md:p-8 flex items-center justify-center min-h-[calc(100vh-64px)]">
                    <Spinner className="h-12 w-12" />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-transparent">
            <Header />
            <div className="px-4 py-6 md:px-8 md:py-8">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-6 flex items-center justify-between">
                        <h1 className="text-2xl font-semibold text-white md:text-3xl">
                            Generated Presentations
                        </h1>
                        <GridSizeControl gridSize={gridSize} onGridSizeChange={setGridSize} />
                    </div>

                    {/* Search Bar */}
                    <PresentationSearchBar onSearch={handleSearch} />

                    {error && (
                        <Alert
                            variant="destructive"
                            className="mb-6 bg-red-500/20 border-red-500/50 text-white"
                        >
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <div
                        className={`grid grid-cols-1 ${
                            gridSize === 2
                                ? "md:grid-cols-2"
                                : gridSize === 3
                                  ? "md:grid-cols-2 lg:grid-cols-3"
                                  : "md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                        } gap-5`}
                    >
                        {filteredPresentations.length === 0 ? (
                            <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
                                <h2 className="mb-2 text-xl text-white md:text-2xl">
                                    {presentations.length === 0
                                        ? "No Presentations Generated Yet"
                                        : "No presentations match your search"}
                                </h2>
                            </div>
                        ) : (
                            filteredPresentations.map((presentation) => (
                                <PresentationCard
                                    key={presentation.id}
                                    presentation={presentation}
                                    isDeleting={deletingId === presentation.id}
                                    onCardClick={handlePresentationClick}
                                    onDelete={handleDeletePresentation}
                                    formatDate={formatDate}
                                />
                            ))
                        )}
                    </div>
                </div>
            </div>

            <Dialog
                open={!!presentationToDelete}
                onOpenChange={(open) => !open && setPresentationToDelete(null)}
            >
                <DialogContent className="bg-white/10 backdrop-blur-md border-white/20 text-white shadow-2xl">
                    <DialogHeader>
                        <DialogTitle>Delete Presentation</DialogTitle>
                        <DialogDescription className="text-white/70">
                            Are you sure you want to delete this presentation? This action cannot be
                            undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setPresentationToDelete(null)}
                            className="text-white hover:bg-white/10 hover:text-white"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={executeDelete}
                            disabled={deletingId !== null}
                            className="bg-red-500 hover:bg-red-600 text-white"
                        >
                            {deletingId !== null ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                "Delete"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
