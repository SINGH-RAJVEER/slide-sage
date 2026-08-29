import { StreamingProvider } from "@slidesage/ui";
import { LoadingScreen } from "@slidesage/ui/components/loading-screen";
import { Suspense } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "@/app/router/router";
import { VimModeProvider } from "@/context/VimModeContext";

export default function App() {
	return (
		<VimModeProvider>
			<StreamingProvider>
				<Suspense fallback={<LoadingScreen label="Loading page" />}>
					<RouterProvider router={router} />
				</Suspense>
			</StreamingProvider>
		</VimModeProvider>
	);
}
