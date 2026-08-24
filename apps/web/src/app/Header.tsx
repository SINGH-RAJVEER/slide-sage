import { useAuth } from "@slidesage/ui";
import { type HeaderRoutes, Header as HeaderView } from "@slidesage/ui/components/Header";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ROUTES } from "@/app/router/paths";

const HEADER_ROUTES: HeaderRoutes = {
	home: ROUTES.home,
	landing: ROUTES.landing,
	generate: ROUTES.generate,
	research: ROUTES.research,
	presentations: ROUTES.presentations,
	marketplace: ROUTES.marketplace,
	purchase: ROUTES.purchase,
	profile: ROUTES.profile,
	settings: ROUTES.settings,
	auth: [ROUTES.signIn, ROUTES.signUp, ROUTES.forgotPassword, ROUTES.resetPassword],
};

export default function Header({ sticky = false }: { sticky?: boolean }) {
	const { user, signOut } = useAuth();
	const location = useLocation();
	const navigate = useNavigate();

	return (
		<HeaderView
			currentPath={location.pathname}
			routes={HEADER_ROUTES}
			LinkComponent={Link}
			user={user}
			sticky={sticky}
			onNavigate={navigate}
			onSignOut={signOut}
		/>
	);
}
