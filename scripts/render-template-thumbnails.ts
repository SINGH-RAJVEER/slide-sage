/**
 * Renders the cover slide of each published template package to a WebP
 * thumbnail, so the marketplace can browse templates without downloading
 * packages that run to tens of megabytes.
 *
 *   bun scripts/render-template-thumbnails.ts --source templates/v1 --out .thumbnails
 *
 * Upload the results to pptx-templates/{id}/{version}/thumbnails/cover.webp,
 * which is the path libs/types/src/template-catalog.ts advertises.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

interface Options {
	source: string;
	out: string;
	only: Set<string>;
	width: number;
	quality: number;
}

function parseArgs(argv: string[]): Options {
	const flags = new Map<string, string>();
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg?.startsWith("--")) flags.set(arg.slice(2), argv[index + 1] ?? "");
	}
	return {
		source: flags.get("source") ?? "templates/v1",
		out: flags.get("out") ?? ".thumbnails",
		only: new Set((flags.get("only") ?? "").split(",").filter(Boolean)),
		width: Number(flags.get("width") ?? 1280),
		quality: Number(flags.get("quality") ?? 82),
	};
}

const HARNESS = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#fff}#stage{position:relative;overflow:hidden}</style>
<div id="stage"></div>`;

async function main() {
	const options = parseArgs(process.argv.slice(2));

	const entries = (await readdir(options.source))
		.filter((name) => name.endsWith(".pptx"))
		.map((name) => name.replace(/\.pptx$/, ""))
		.filter((id) => options.only.size === 0 || options.only.has(id))
		.sort();
	if (entries.length === 0) throw new Error(`no .pptx files in ${options.source}`);

	// Bundle the renderer once; the page imports nothing from the network.
	// The renderer is a dependency of libs/ui, so resolve from there rather than
	// duplicating it at the workspace root.
	const build = await Bun.build({
		entrypoints: ["scripts/thumbnail-entry.ts"],
		target: "browser",
		minify: true,
		root: ".",
		conditions: ["browser", "import"],
		external: [],
		naming: "thumbnail-entry.js",
		define: {},
		plugins: [
			{
				name: "resolve-from-ui",
				setup(builder) {
					builder.onResolve({ filter: /^@aiden0z\/pptx-renderer$/ }, () => ({
						path: Bun.resolveSync("@aiden0z/pptx-renderer", `${process.cwd()}/libs/ui`),
					}));
				},
			},
		],
	});
	if (!build.success) throw new AggregateError(build.logs, "failed to bundle the renderer");
	const bundle = await build.outputs[0]?.text();
	if (!bundle) throw new Error("renderer bundle was empty");

	await mkdir(options.out, { recursive: true });
	// NixOS cannot run Playwright's downloaded build, so honour an explicit path.
	const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];
	const launchOptions = executablePath ? { executablePath } : {};
	let browser = await chromium.launch(launchOptions);
	let rendered = 0;
	let failed = 0;

	try {
		for (const id of entries) {
			// A package that crashes the renderer takes the browser with it.
			// Relaunch so one bad deck cannot cost every deck after it.
			if (!browser.isConnected()) browser = await chromium.launch(launchOptions);
			let page: Page | undefined;
			try {
				page = await browser.newPage({ viewport: { width: options.width, height: 720 } });
				await page.setContent(HARNESS);
				// The bundle carries import.meta, which a classic script cannot
				// compile; a module script can, and still assigns the global.
				await page.addScriptTag({ content: bundle, type: "module" });

				const pptx = await readFile(join(options.source, `${id}.pptx`));
				const size = await page.evaluate(
					async ([encoded, width]) => {
						const binary = atob(encoded as string);
						const bytes = new Uint8Array(binary.length);
						for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
						return await window.renderCoverSlide(bytes, Number(width));
					},
					[pptx.toString("base64"), String(options.width)] as const,
				);

				const stage = page.locator("#stage");
				// Playwright encodes PNG or JPEG only, so the cover is re-encoded
				// in the page. The catalog advertises cover.webp and the API
				// refuses anything else, so a silent fallback must fail loudly.
				const shot = await stage.screenshot({ type: "png" });
				const cover = await page.evaluate(
					async ([png, quality]) => {
						const source = await fetch(`data:image/png;base64,${png}`).then((response) =>
							response.blob(),
						);
						const bitmap = await createImageBitmap(source);
						const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
						canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
						const encoded = await canvas.convertToBlob({
							type: "image/webp",
							quality: Number(quality) / 100,
						});
						if (encoded.type !== "image/webp") throw new Error(`browser encoded ${encoded.type}`);
						const bytes = new Uint8Array(await encoded.arrayBuffer());
						let binary = "";
						for (const byte of bytes) binary += String.fromCharCode(byte);
						return btoa(binary);
					},
					[shot.toString("base64"), String(options.quality)] as const,
				);
				await writeFile(join(options.out, `${id}.webp`), Buffer.from(cover, "base64"));
				rendered += 1;
				console.log(`rendered  ${id.padEnd(52)} ${size.width}x${size.height}`);
			} catch (error) {
				failed += 1;
				console.log(`FAIL      ${id.padEnd(52)} ${(error as Error).message}`);
			} finally {
				await page?.close().catch(() => {});
			}
		}
	} finally {
		await browser.close();
	}

	console.log(`\n${rendered} rendered, ${failed} failed -> ${options.out}`);
	if (failed > 0) process.exit(1);
}

declare global {
	interface Window {
		renderCoverSlide(bytes: Uint8Array, width: number): Promise<{ width: number; height: number }>;
	}
}

await main();
