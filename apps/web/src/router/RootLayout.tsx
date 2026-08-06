import { GenerationStatusIndicator } from "@slidesage/ui";
import { Outlet } from "react-router-dom";

export default function RootLayout() {
	return (
		<>
			<Outlet />
			<GenerationStatusIndicator />
		</>
	);
}
