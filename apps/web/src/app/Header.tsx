import { useAuth } from "@slidesage/ui";
import { type HeaderRoutes, Header as HeaderView } from "@slidesage/ui/components/Header";
import { ActiveGenerationIndicator } from "@slidesage/ui/components/StatusIndicator/ActiveGenerationIndicator";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ROUTES } from "@/app/router/paths";

const HEADER_ROUTES: HeaderRoutes = {
	home: ROUTES.home,
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
			activeGeneration={
				<ActiveGenerationIndicator
					hidden={
						location.pathname === ROUTES.presentation ||
						Boolean(
							location.pathname.startsWith(`${ROUTES.presentations}/`) &&
								location.pathname !== ROUTES.presentations,
						)
					}
					onOpen={(presentationId) =>
						navigate(presentationId ? ROUTES.presentationById(presentationId) : ROUTES.presentation)
					}
				/>
			}
		/>
	);
}
