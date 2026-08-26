import { LoadingScreen, useAuth } from "@slidesage/ui";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/app/router/paths";

/**
 * Signed-in visitors land on the page they picked in settings. The generate
 * page is the default; the presentation library is opt-in.
 */
export default function HomePage() {
	const { user } = useAuth();
	const navigate = useNavigate();

	useEffect(() => {
		navigate(user?.landingPage === "presentations" ? ROUTES.presentations : ROUTES.generate, {
			replace: true,
		});
	}, [user?.landingPage, navigate]);

	// Navigation effect will replace this route with the target page.
	return <LoadingScreen label="Opening SlideSage" />;
}
