import { LoadingScreen } from "@slidesage/ui/components/loading-screen";
import type { ComponentType } from "react";
import { createBrowserRouter } from "react-router-dom";
import EntranceRoute from "@/app/router/EntranceRoute";
import RequireSignedInLayout from "@/app/router/RequireSignedInLayout";
import RootLayout from "@/app/router/RootLayout";
import LandingPage from "@/routes/landing/LandingPage";
import ForgotPasswordPage from "@/routes/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/routes/auth/ResetPasswordPage";
import SignInPage from "@/routes/auth/SignInPage";
import SignUpPage from "@/routes/auth/SignUpPage";
import VerifyEmailPage from "@/routes/auth/VerifyEmailPage";
import NotFoundPage from "@/routes/NotFoundPage";
import RouteErrorPage from "@/routes/RouteErrorPage";
import ProfilePage from "@/routes/settings/ProfilePage";
import SettingsPage from "@/routes/settings/SettingsPage";

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
			{ index: true, element: <EntranceRoute /> },
			/* the landing page is always public, so the header icon can reach
			   it even for signed-in users */
			{ path: "landing", element: <LandingPage /> },
			{ path: "sign-in/*", element: <SignInPage /> },
			{ path: "sign-up/*", element: <SignUpPage /> },
			{ path: "sign-up/verify-email", element: <VerifyEmailPage /> },
			{ path: "forgot-password", element: <ForgotPasswordPage /> },
			{ path: "reset-password", element: <ResetPasswordPage /> },
			{
				element: <RequireSignedInLayout />,
				children: [
					{ path: "profile", element: <ProfilePage /> },
					{ path: "settings", element: <SettingsPage /> },
					{
						path: "generate",
						lazy: lazyRoute(() => import("@/routes/presentations/GeneratePPTPage")),
					},
					{
						path: "generate/research",
						lazy: lazyRoute(() => import("@/routes/presentations/GenerateResearchPage")),
					},
					{
						path: "marketplace",
						lazy: lazyRoute(() => import("@/routes/marketplace/MarketplacePage")),
					},
					{
						path: "marketplace/:marketplaceId/preview",
						lazy: lazyRoute(() => import("@/routes/marketplace/MarketplaceThemePreviewPage")),
					},
					{
						path: "presentations",
						lazy: lazyRoute(() => import("@/routes/presentations/PresentationsGridPage")),
					},
					{
						path: "presentations/:presentationId",
						lazy: lazyRoute(() => import("@/routes/presentations/PresentationViewer")),
					},
					// Streaming / legacy route (kept because generation navigates here before an id exists)
					{
						path: "presentation",
						lazy: lazyRoute(() => import("@/routes/presentations/PresentationViewer")),
					},
					{
						path: "presentation-error",
						lazy: lazyRoute(() => import("@/routes/presentations/PresentationErrorPage")),
					},
					{
						path: "purchase",
						lazy: lazyRoute(() => import("@/routes/billing/PurchaseTokensPage")),
					},
				],
			},
			{ path: "*", element: <NotFoundPage /> },
		],
	},
]);
