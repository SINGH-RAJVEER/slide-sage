import type { ComponentType } from "react";
import { createBrowserRouter } from "react-router-dom";
import { LoadingScreen } from "@/components/ui/loading-screen";
import RequireSignedInLayout from "@/router/RequireSignedInLayout";
import RootLayout from "@/router/RootLayout";
import ForgotPasswordPage from "@/routes/ForgotPasswordPage";
import HomePage from "@/routes/HomePage";
import NotFoundPage from "@/routes/NotFoundPage";
import ProfilePage from "@/routes/ProfilePage";
import ResetPasswordPage from "@/routes/ResetPasswordPage";
import RouteErrorPage from "@/routes/RouteErrorPage";
import SignInPage from "@/routes/SignInPage";
import SignUpPage from "@/routes/SignUpPage";
import VerifyEmailPage from "@/routes/VerifyEmailPage";

function lazyRoute<T extends { default: ComponentType }>(importer: () => Promise<T>) {
    return async () => {
        const mod = await importer();
        return { Component: mod.default };
    };
}

export const router = createBrowserRouter([
    {
        element: <RootLayout />,
        errorElement: <RouteErrorPage />,
        hydrateFallbackElement: <LoadingScreen label="Loading page" />,
        children: [
            { path: "sign-in/*", element: <SignInPage /> },
            { path: "sign-up/*", element: <SignUpPage /> },
            { path: "sign-up/verify-email", element: <VerifyEmailPage /> },
            { path: "forgot-password", element: <ForgotPasswordPage /> },
            { path: "reset-password", element: <ResetPasswordPage /> },
            {
                element: <RequireSignedInLayout />,
                children: [
                    { index: true, element: <HomePage /> },
                    { path: "profile", element: <ProfilePage /> },
                    {
                        path: "generate",
                        lazy: lazyRoute(() => import("@/modules/pages/GeneratePPTPage")),
                    },
                    {
                        path: "generate/research",
                        lazy: lazyRoute(() => import("@/modules/pages/GenerateResearchPage")),
                    },
                    {
                        path: "marketplace",
                        lazy: lazyRoute(() => import("@/modules/pages/MarketplacePage")),
                    },
                    {
                        path: "marketplace/:marketplaceId/preview",
                        lazy: lazyRoute(
                            () => import("@/modules/pages/MarketplaceThemePreviewPage"),
                        ),
                    },
                    {
                        path: "presentations",
                        lazy: lazyRoute(() => import("@/modules/pages/PresentationsGridPage")),
                    },
                    {
                        path: "presentations/:presentationId",
                        lazy: lazyRoute(() => import("@/modules/pages/PresentationViewer")),
                    },
                    // Streaming / legacy route (kept because generation navigates here before an id exists)
                    {
                        path: "presentation",
                        lazy: lazyRoute(() => import("@/modules/pages/PresentationViewer")),
                    },
                    {
                        path: "presentation-error",
                        lazy: lazyRoute(() => import("@/modules/pages/PresentationErrorPage")),
                    },
                    {
                        path: "purchase",
                        lazy: lazyRoute(() => import("@/modules/pages/PurchaseTokensPage")),
                    },
                ],
            },
            { path: "*", element: <NotFoundPage /> },
        ],
    },
]);
