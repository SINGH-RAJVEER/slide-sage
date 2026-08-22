import { ActiveGenerationIndicator as IndicatorView } from "@slidesage/ui/components/StatusIndicator/ActiveGenerationIndicator";
import { useLocation, useNavigate } from "react-router-dom";
import { ROUTES } from "@/app/router/paths";

/** Mounts the floating generation indicator with routing awareness. */
export default function ActiveGenerationIndicator() {
	const navigate = useNavigate();
	const location = useLocation();

	const onViewerRoute =
		location.pathname === ROUTES.presentation ||
		(location.pathname.startsWith(`${ROUTES.presentations}/`) &&
			location.pathname !== ROUTES.presentations);

	return (
		<IndicatorView
			hidden={onViewerRoute}
			onOpen={(presentationId) =>
				navigate(presentationId ? ROUTES.presentationById(presentationId) : ROUTES.presentation)
			}
		/>
	);
}
