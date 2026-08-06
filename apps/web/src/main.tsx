import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "./App";
import "@slidesage/ui/styles/index.css";
import { AuthProvider } from "@slidesage/ui";

const container = document.getElementById("root");
if (!container) {
	throw new Error("Missing #root element");
}

const rootContainer: HTMLElement = container;

const app = (
	<StrictMode>
		<AuthProvider>
			<App />
		</AuthProvider>
	</StrictMode>
);

if (import.meta.hot) {
	const data = import.meta.hot.data as { root?: Root };

	if (!data.root) {
		data.root = createRoot(rootContainer);
	}

	data.root.render(app);
} else {
	createRoot(rootContainer).render(app);
}
