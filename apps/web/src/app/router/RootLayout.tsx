import { Outlet } from "react-router-dom";
import ActiveGenerationIndicator from "@/app/ActiveGenerationIndicator";
import VimNavigation from "@/app/VimNavigation";

export default function RootLayout() {
	return (
		<>
			<VimNavigation />
			<Outlet />
			<ActiveGenerationIndicator />
		</>
	);
}
