import type {
    ApiErrorResponse,
    PresentationResponse,
    PresentationSummary,
    PresentationsResponse,
} from "@slide-sage/types";
import { Alert, AlertDescription, AlertTitle } from "@slide-sage/ui/components/alert";
import { Button } from "@slide-sage/ui/components/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@slide-sage/ui/components/dialog";
import { Spinner } from "@slide-sage/ui/components/spinner";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import {
    GridSizeControl,
    PresentationCard,
    PresentationSearchBar,
} from "@/components/Presentations";
import { API_URL } from "@/lib/api";
import { PRESENTATIONS_UPDATED_EVENT } from "@/lib/presentation-events";
import { getPresentationRetryDestination } from "@/lib/presentation-retry";
import { ROUTES } from "@/router/paths";

interface SearchFilters {
    query: string;
}

export default function PresentationsGridPage() {
    const [presentations, setPresentations] = useState<PresentationSummary[]>([]);
    const [filteredPresentations, setFilteredPresentations] = useState<PresentationSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [openingId, setOpeningId] = useState<string | null>(null);
    const [presentationToDelete, setPresentationToDelete] = useState<string | null>(null);
    const [gridSize, setGridSize] = useState<2 | 3 | 4>(() => {
        const saved = localStorage.getItem("gridSize");
        return saved ? (parseInt(saved, 10) as 2 | 3 | 4) : 3;
    });
    const navigate = useNavigate();

    const fetchPresentations = useCallback(async (background = false) => {
        try {
            if (!background) setLoading(true);
            const response = await fetch(`${API_URL}/api/presentations`, {
                credentials: "include",
            });

            if (response.status === 401) {
                setError("Authentication failed. Please log in again.");
                return;
            }

            const result = (await response.json()) as PresentationsResponse | ApiErrorResponse;

            // New API format: {presentations: [...]} or {error: {message: "..."}}
            if ("error" in result) {
                setError(result.error.message);
            } else {
                const presentationsList = result.presentations;
                setPresentations(presentationsList);
                setFilteredPresentations(presentationsList);
            }
        } catch (err) {
            setError(`Error: ${err instanceof Error ? err.message : err}`);
        } finally {
            if (!background) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchPresentations();
    }, [fetchPresentations]);

    useEffect(() => {
        const handlePresentationsUpdated = () => {
            void fetchPresentations(true);
        };

        window.addEventListener(PRESENTATIONS_UPDATED_EVENT, handlePresentationsUpdated);
        return () => {
            window.removeEventListener(PRESENTATIONS_UPDATED_EVENT, handlePresentationsUpdated);
        };
    }, [fetchPresentations]);

    useEffect(() => {
        localStorage.setItem("gridSize", gridSize.toString());
    }, [gridSize]);

    const handlePresentationClick = async (presentationId: string) => {
        try {
            setOpeningId(presentationId);
            const response = await fetch(`${API_URL}/api/presentations/${presentationId}`, {
                credentials: "include",
            });

            if (response.status === 401) {
                setError("Session expired. Please log in again.");
                return;
            }

            const result = (await response.json()) as PresentationResponse | ApiErrorResponse;

            // New API format: {presentation: {...}} or {error: {message: "..."}}
            if ("error" in result) {
                setError(result.error.message);
            } else {
                const retryDestination = getPresentationRetryDestination(
                    result.presentation.slides_data,
                    result.presentation.id,
                );

                if (retryDestination) {
                    navigate(retryDestination.to, { state: retryDestination.state });
                    return;
                }

                navigate(ROUTES.presentationById(result.presentation.id), {
                    state: {
                        presentation: result.presentation.slides_data,
                        presentationId: result.presentation.id,
                    },
                });
            }
        } catch (err) {
            setError(`Error: ${err instanceof Error ? err.message : err}`);
        } finally {
            setOpeningId(null);
        }
    };

    const handleDeletePresentation = (e: React.MouseEvent, presentationId: string) => {
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
            const year = Number(fullDateMatch[1]);
            const month = Number(fullDateMatch[2]);
            const day = Number(fullDateMatch[3]);
            const start = new Date(year, month - 1, day, 0, 0, 0, 0);
            const end = new Date(year, month - 1, day, 23, 59, 59, 999);
            return { start, end };
        }

        const monthMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
        if (monthMatch) {
            const year = Number(monthMatch[1]);
            const month = Number(monthMatch[2]);
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

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-transparent">
            <Header />
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
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

                    {loading ? (
                        <div
                            className="flex min-h-64 items-center justify-center"
                            role="status"
                            aria-label="Loading presentations"
                        >
                            <Spinner className="size-6 text-white/60" aria-hidden="true" />
                        </div>
                    ) : (
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
                                        isOpening={openingId === presentation.id}
                                        onCardClick={handlePresentationClick}
                                        onDelete={handleDeletePresentation}
                                        formatDate={formatDate}
                                    />
                                ))
                            )}
                        </div>
                    )}
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
                                    <Spinner className="mr-2" />
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
