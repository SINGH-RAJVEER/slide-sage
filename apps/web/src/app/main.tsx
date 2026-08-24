import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installPreloadErrorRecovery } from "./preload-error-recovery";
import "../../styles.css";
import { AuthProvider } from "@slidesage/ui";

installPreloadErrorRecovery();

const container = document.getElementById("root");
if (!container) {
	throw new Error("Missing #root element");
}

createRoot(container).render(
	<StrictMode>
		<AuthProvider>
			<App />
		</AuthProvider>
	</StrictMode>,
);
