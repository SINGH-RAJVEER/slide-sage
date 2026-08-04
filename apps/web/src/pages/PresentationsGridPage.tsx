import type {
    ApiErrorResponse,
    PresentationResponse,
    PresentationSummary,
    PresentationsResponse,
} from "@slidesage/types";
import { Alert, AlertDescription, AlertTitle } from "@slidesage/ui/components/alert";
import { Button } from "@slidesage/ui/components/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@slidesage/ui/components/dialog";
import {
    GridSizeControl,
    PresentationCard,
    PresentationSearchBar,
} from "@slidesage/ui/components/Presentations";
import { Spinner } from "@slidesage/ui/components/spinner";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, readJsonResponse } from "@/lib/api";
import { PRESENTATIONS_UPDATED_EVENT } from "@/lib/presentation-events";
import { getPresentationRetryDestination } from "@/lib/presentation-retry";
import Header from "@/modules/Header";
import { ROUTES } from "@/router/paths";

interface SearchFilters {
    query: string;
}

interface PaginationState {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
}

interface FetchPresentationsOptions {
    background?: boolean;
    append?: boolean;
    offset?: number;
}

const PRESENTATIONS_PAGE_SIZE = 20;

function parseDateRange(value: string) {
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
}

export default function PresentationsGridPage() {
    const [presentations, setPresentations] = useState<PresentationSummary[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [openingId, setOpeningId] = useState<string | null>(null);
    const [presentationToDelete, setPresentationToDelete] = useState<string | null>(null);
    const [pagination, setPagination] = useState<PaginationState>({
        total: 0,
        limit: PRESENTATIONS_PAGE_SIZE,
        offset: 0,
        hasMore: false,
    });
    const [gridSize, setGridSize] = useState<2 | 3 | 4>(() => {
        const saved = localStorage.getItem("gridSize");
        return saved ? (parseInt(saved, 10) as 2 | 3 | 4) : 3;
    });
    const navigate = useNavigate();

    const filteredPresentations = useMemo(() => {
        const query = searchQuery.trim();
        if (!query) return presentations;

        const dateRange = parseDateRange(query);
        if (dateRange) {
            return presentations.filter((presentation) => {
                const createdDate = new Date(presentation.created_at);
                return createdDate >= dateRange.start && createdDate <= dateRange.end;
            });
        }

        const queryLower = query.toLowerCase();
        return presentations.filter(
            (presentation) =>
                presentation.title.toLowerCase().includes(queryLower) ||
                presentation.prompt.toLowerCase().includes(queryLower),
        );
    }, [presentations, searchQuery]);

    const fetchPresentations = useCallback(
        async ({
            background = false,
            append = false,
            offset = 0,
        }: FetchPresentationsOptions = {}) => {
            try {
                if (append) setLoadingMore(true);
                else if (!background) setLoading(true);
                setError("");
                const response = await fetch(
                    `${API_URL}/presentations?limit=${PRESENTATIONS_PAGE_SIZE}&offset=${offset}`,
                    {
                        credentials: "include",
                    },
                );
                const result = await readJsonResponse<PresentationsResponse | ApiErrorResponse>(
                    response,
                );

                if (response.status === 401) {
                    setError("Authentication failed. Please log in again.");
                    return;
                }

                if (!response.ok || !result || "error" in result) {
                    const message = result && "error" in result ? result.error.message : undefined;
                    setError(message || `Failed to load presentations (${response.status}).`);
                    return;
                }

                const presentationsList = result.presentations;
                setPresentations((current) => {
                    if (!append) return presentationsList;

                    const existingIds = new Set(current.map((presentation) => presentation.id));
                    return [
                        ...current,
                        ...presentationsList.filter(
                            (presentation) => !existingIds.has(presentation.id),
                        ),
                    ];
                });
                setPagination({
                    total: result.total,
                    limit: result.limit,
                    offset: result.offset,
                    hasMore: result.has_more,
                });
            } catch (err) {
                setError(`Error: ${err instanceof Error ? err.message : err}`);
            } finally {
                if (append) setLoadingMore(false);
                else if (!background) setLoading(false);
            }
        },
        [],
    );

    useEffect(() => {
        void fetchPresentations();
    }, [fetchPresentations]);

    useEffect(() => {
        const handlePresentationsUpdated = () => {
            void fetchPresentations({ background: true });
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
            const response = await fetch(`${API_URL}/presentations/${presentationId}`, {
                credentials: "include",
            });

            if (response.status === 401) {
                setError("Session expired. Please log in again.");
                return;
            }

            const result = (await response.json()) as PresentationResponse | ApiErrorResponse;

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
            const response = await fetch(`${API_URL}/presentations/${presentationId}`, {
                method: "DELETE",
                credentials: "include",
            });

            if (response.status === 401) {
                setError("Session expired. Please log in again.");
                return;
            }

            const result =
                response.status === 204 ? null : await readJsonResponse<ApiErrorResponse>(response);

            if (!response.ok) {
                setError(
                    result?.error.message || `Failed to delete presentation (${response.status}).`,
                );
                return;
            }

            setPresentations((current) =>
                current.filter((presentation) => presentation.id !== presentationId),
            );
            setPagination((current) => ({
                ...current,
                total: Math.max(0, current.total - 1),
            }));
        } catch (err) {
            setError(`Error: ${err instanceof Error ? err.message : err}`);
        } finally {
            setDeletingId(null);
            setPresentationToDelete(null);
        }
    };

    const handleSearch = (filters: SearchFilters) => {
        setSearchQuery(filters.query);
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
                        <>
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

                            {pagination.hasMore ? (
                                <div className="mt-8 flex flex-col items-center gap-3 pb-4">
                                    <p className="text-sm text-white/45">
                                        Showing {presentations.length} of {pagination.total}
                                    </p>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={loadingMore}
                                        onClick={() =>
                                            void fetchPresentations({
                                                append: true,
                                                offset: presentations.length,
                                            })
                                        }
                                        className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                                    >
                                        {loadingMore ? (
                                            <>
                                                <Spinner className="mr-2" />
                                                Loading...
                                            </>
                                        ) : (
                                            "Load more"
                                        )}
                                    </Button>
                                </div>
                            ) : null}
                        </>
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
