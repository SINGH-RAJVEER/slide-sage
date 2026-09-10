import { Outlet } from "react-router-dom";
import ActiveGenerationIndicator from "../ActiveGenerationIndicator";
import VimNavigation from "../VimNavigation";

export default function RootLayout() {
	return (
		<>
			<VimNavigation />
			<Outlet />
			<ActiveGenerationIndicator />
		</>
	);
}
