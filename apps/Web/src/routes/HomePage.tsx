import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { Spinner } from "@/components/ui/spinner";
import { API_URL } from "@/lib/api";
import { ROUTES } from "@/router/paths";

export default function HomePage() {
    const [loading, setLoading] = useState(true);
    const [hasPresentations, setHasPresentations] = useState(false);
    const navigate = useNavigate();

    const checkPresentations = useCallback(async () => {
        try {
            const response = await fetch(`${API_URL}/api/presentations`, {
                credentials: "include",
            });

            if (response.status === 401) {
                setHasPresentations(false);
                return;
            }

            const result = await response.json();
            setHasPresentations(result.success && result.presentations.length > 0);
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
        return (
            <div className="min-h-screen bg-transparent">
                <Header />
                <div className="p-4 md:p-8 flex items-center justify-center min-h-[calc(100vh-64px)]">
                    <Spinner className="h-12 w-12" />
                </div>
            </div>
        );
    }

    // Navigation effect will replace this route with the target page.
    return null;
}
