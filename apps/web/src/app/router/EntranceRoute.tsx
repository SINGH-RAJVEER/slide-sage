import { LoadingScreen, useAuth } from "@slidesage/ui";
import LandingPage from "../../routes/landing/LandingPage";
import HomePage from "../../routes/presentations/HomePage";

/**
 * The index route.
 *
 * Visitors who are not signed in always see the public landing page. Signed-in
 * visitors go wherever their default-page setting points, which includes
 * staying on the landing page if that is what they chose.
 */
export default function EntranceRoute() {
	const { isSignedIn, loading, user } = useAuth();

	if (loading) {
		return <LoadingScreen label="Loading SlideSage" />;
	}
	if (!isSignedIn || user?.landingPage === "landing") {
		return <LandingPage />;
	}
	// HomePage forwards to the generate or presentations page.
	return <HomePage />;
}
