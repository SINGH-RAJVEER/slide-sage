import { LoadingScreen, useAuth } from "@slidesage/ui";
import LandingPage from "@/routes/landing/LandingPage";
import HomePage from "@/routes/presentations/HomePage";

/**
 * The index route. Signed-in visitors go straight to the app home; everyone
 * else sees the public landing page.
 */
export default function EntranceRoute() {
	const { isSignedIn, loading } = useAuth();

	if (loading) {
		return <LoadingScreen label="Loading SlideSage" />;
	}

	return isSignedIn ? <HomePage /> : <LandingPage />;
}
