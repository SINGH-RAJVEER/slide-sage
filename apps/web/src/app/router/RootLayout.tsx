import { Outlet } from "react-router-dom";
import ActiveGenerationIndicator from "@/app/ActiveGenerationIndicator";

export default function RootLayout() {
	return (
		<>
			<Outlet />
			<ActiveGenerationIndicator />
		</>
	);
}
