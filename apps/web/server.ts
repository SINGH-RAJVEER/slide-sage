import app from "./index.html";

const server = Bun.serve({
	port: Number(process.env["PORT"]) || 5173,
	routes: {
		"/favicon.ico": Bun.file("./public/favicon.ico"),
		"/favicon.png": Bun.file("./public/favicon.png"),
		"/icon.png": Bun.file("./public/icon.png"),
		"/icon.webp": Bun.file("./public/icon.webp"),
		"/*": app,
	},
	development: {
		hmr: true,
		console: true,
	},
});

console.log(`Web server running at ${server.url}`);
