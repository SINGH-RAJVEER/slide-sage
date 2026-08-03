import type { ApiErrorResponse, PresentationsResponse } from "@slidesage/types";
import { LoadingScreen } from "@slidesage/ui/components/loading-screen";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, readJsonResponse } from "@/lib/api";
import { ROUTES } from "@/router/paths";

export default function HomePage() {
    const [loading, setLoading] = useState(true);
    const [hasPresentations, setHasPresentations] = useState(false);
    const navigate = useNavigate();

    const checkPresentations = useCallback(async () => {
        try {
            const response = await fetch(`${API_URL}/presentations?limit=1`, {
                credentials: "include",
            });
            const result = await readJsonResponse<PresentationsResponse | ApiErrorResponse>(
                response,
            );

            if (!response.ok) {
                if (response.status === 401) {
                    setHasPresentations(false);
                    return;
                }

                const message = result && "error" in result ? result.error.message : undefined;
                throw new Error(message || `Failed to load presentations (${response.status})`);
            }

            setHasPresentations(
                Boolean(result && "presentations" in result && result.presentations.length > 0),
            );
        } catch (err) {
            console.error("Error checking presentations:", err);
            setHasPresentations(false);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        checkPresentations();
    }, [checkPresentations]);

    useEffect(() => {
        if (loading) return;
        navigate(hasPresentations ? ROUTES.presentations : ROUTES.generate, {
            replace: true,
        });
    }, [loading, hasPresentations, navigate]);

    if (loading) {
        return <LoadingScreen label="Loading presentations" />;
    }

    // Navigation effect will replace this route with the target page.
    return null;
}
