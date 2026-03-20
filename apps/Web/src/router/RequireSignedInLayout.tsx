import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

function buildRedirectUrl(location: ReturnType<typeof useLocation>) {
    const current = `${location.pathname}${location.search}${location.hash}`;
    const redirectUrl = encodeURIComponent(current);
    return `/sign-in?redirect_url=${redirectUrl}`;
}

export default function RequireSignedInLayout() {
    const location = useLocation();
    const { isSignedIn, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-transparent flex items-center justify-center">
                <div className="text-white">Loading...</div>
            </div>
        );
    }

    return <>{isSignedIn ? <Outlet /> : <Navigate to={buildRedirectUrl(location)} replace />}</>;
}
