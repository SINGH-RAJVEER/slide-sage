import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(() => {
	const proxyTarget =
		process.env.VITE_API_URL ||
		"http://localhost:8000";

	return {
		plugins: [
			react(),
			tsconfigPaths(),
		],
		envDir: "../../",
		server: {
			proxy: {
				"/api": {
					target: proxyTarget,
					changeOrigin: true,
				},
			},
		},
	};
});
