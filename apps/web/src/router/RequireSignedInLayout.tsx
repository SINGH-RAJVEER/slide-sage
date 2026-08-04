import { LoadingScreen } from "@slidesage/ui/components/loading-screen";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@slidesage/ui";

function buildRedirectUrl(location: ReturnType<typeof useLocation>) {
    const current = `${location.pathname}${location.search}${location.hash}`;
    const redirectUrl = encodeURIComponent(current);
    return `/sign-in?redirect_url=${redirectUrl}`;
}

export default function RequireSignedInLayout() {
    const location = useLocation();
    const { isSignedIn, loading } = useAuth();

    if (loading) {
        return <LoadingScreen label="Checking session" />;
    }

    return <>{isSignedIn ? <Outlet /> : <Navigate to={buildRedirectUrl(location)} replace />}</>;
}
