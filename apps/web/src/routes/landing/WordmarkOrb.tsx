import { useEffect, useRef } from "react";
import { WORDMARK_ORB_FRAGMENT_SHADER, WORDMARK_ORB_VERTEX_SHADER } from "./wordmark-orb-shaders";

/* The orb's rotation speed lives in the fragment shader (0.2417 rad/s), which
   spins the sphere once every 26 seconds so it revolves together with the
   slide ring. */
const STATIC_ELAPSED = 4.2;

type Star = { x: number; y: number; depth: number; phase: number; drift: number; size: number };

function seeded(index: number, salt: number) {
	return Math.abs(Math.sin(index * 91.173 + salt * 17.719) * 43758.5453) % 1;
}

function createStars(count: number): Star[] {
	return Array.from({ length: count }, (_, index) => ({
		x: seeded(index, 1),
		y: seeded(index, 2),
		depth: 0.25 + seeded(index, 3) * 0.75,
		phase: seeded(index, 4) * Math.PI * 2,
		drift: 0.35 + seeded(index, 5) * 0.65,
		size: 0.45 + seeded(index, 6) * 1.15,
	}));
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
	const shader = gl.createShader(type);
	if (!shader) return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
	return shader;
}

function fract(value: number) {
	return value - Math.floor(value);
}

/* Two wordmark copies sit on the texture (one per hemisphere), centred on the
   equator, in the landing wordmark's own treatment: steel-blue halo fill with
   the icon's dark navy outline beneath. */
function paintWordmarkTexture(canvas: HTMLCanvasElement) {
	const ctx = canvas.getContext("2d");
	if (!ctx || typeof ctx.fillText !== "function") return;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.lineJoin = "round";
	ctx.miterLimit = 2;
	for (const center of [canvas.width * 0.25, canvas.width * 0.75]) {
		let size = 240;
		ctx.font = `${size}px 'Yellowtail', 'Brush Script MT', cursive`;
		const measured = ctx.measureText("SlideSage").width;
		if (measured > 0) {
			size = Math.floor(size * Math.min(1.4, (canvas.width * 0.21) / measured));
			ctx.font = `${size}px 'Yellowtail', 'Brush Script MT', cursive`;
		}
		ctx.strokeStyle = "#042f5c";
		ctx.lineWidth = Math.max(8, size * 0.09);
		ctx.strokeText("SlideSage", center, canvas.height / 2);
		ctx.fillStyle = "#a9b3bd";
		ctx.fillText("SlideSage", center, canvas.height / 2);
	}
}

/* Fallback for browsers without WebGL: the flat SVG wordmark the hero used
   before the orb. */
function WordmarkSvg() {
	return (
		<svg className="w-[86%]" viewBox="0 0 1200 430" aria-hidden="true">
			<defs>
				<filter id="landing-wordmark-halo" x="-40%" y="-40%" width="180%" height="180%">
					<feGaussianBlur in="SourceGraphic" stdDeviation="16" />
				</filter>
			</defs>
			<text
				x="600"
				y="285"
				textAnchor="middle"
				fontFamily="'Yellowtail', 'Brush Script MT', cursive"
				fontSize="250"
				fill="#a9b3bd"
				opacity="0.4"
				filter="url(#landing-wordmark-halo)"
			>
				SlideSage
			</text>
			<text
				x="600"
				y="285"
				textAnchor="middle"
				fontFamily="'Yellowtail', 'Brush Script MT', cursive"
				fontSize="250"
				fill="#0d3762"
				stroke="#042f5c"
				strokeWidth="10"
				paintOrder="stroke"
				strokeLinejoin="round"
			>
				SlideSage
			</text>
		</svg>
	);
}

export function WordmarkOrb() {
	const hostRef = useRef<HTMLDivElement>(null);
	const starCanvasRef = useRef<HTMLCanvasElement>(null);
	const glCanvasRef = useRef<HTMLCanvasElement>(null);
	const fallbackRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const host = hostRef.current;
		const starCanvas = starCanvasRef.current;
		const glCanvas = glCanvasRef.current;
		if (!host || !starCanvas || !glCanvas) return undefined;

		let disposed = false;
		const showFallback = () => {
			const fallback = fallbackRef.current;
			if (!fallback) return;
			fallback.style.display = "grid";
			starCanvas.style.display = "none";
			glCanvas.style.display = "none";
		};

		const starContext = starCanvas.getContext("2d", { alpha: true });
		const gl =
			glCanvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true }) ??
			glCanvas.getContext("experimental-webgl", {
				alpha: true,
				premultipliedAlpha: false,
				antialias: true,
			});
		if (!starContext || typeof starContext.clearRect !== "function" || !gl) {
			showFallback();
			return undefined;
		}
		const webgl = gl as WebGLRenderingContext;

		try {
			const vertex = compile(webgl, webgl.VERTEX_SHADER, WORDMARK_ORB_VERTEX_SHADER);
			const fragment = compile(webgl, webgl.FRAGMENT_SHADER, WORDMARK_ORB_FRAGMENT_SHADER);
			const program = vertex && fragment ? webgl.createProgram() : null;
			if (!vertex || !fragment || !program) throw new Error("wordmark-orb shader init failed");
			webgl.attachShader(program, vertex);
			webgl.attachShader(program, fragment);
			webgl.linkProgram(program);
			if (!webgl.getProgramParameter(program, webgl.LINK_STATUS)) {
				throw new Error("wordmark-orb program link failed");
			}
			webgl.useProgram(program);

			const buffer = webgl.createBuffer();
			webgl.bindBuffer(webgl.ARRAY_BUFFER, buffer);
			webgl.bufferData(
				webgl.ARRAY_BUFFER,
				new Float32Array([-1, -1, 3, -1, -1, 3]),
				webgl.STATIC_DRAW,
			);
			const position = webgl.getAttribLocation(program, "p");
			webgl.enableVertexAttribArray(position);
			webgl.vertexAttribPointer(position, 2, webgl.FLOAT, false, 0, 0);

			const uniforms = {
				time: webgl.getUniformLocation(program, "uT"),
				resolution: webgl.getUniformLocation(program, "uR"),
				wordmark: webgl.getUniformLocation(program, "uW"),
			};
			webgl.enable(webgl.BLEND);
			webgl.blendFunc(webgl.SRC_ALPHA, webgl.ONE_MINUS_SRC_ALPHA);
			webgl.clearColor(0, 0, 0, 0);

			const texture = webgl.createTexture();
			const texCanvas = document.createElement("canvas");
			texCanvas.width = 2048;
			texCanvas.height = 512;
			paintWordmarkTexture(texCanvas);
			webgl.activeTexture(webgl.TEXTURE0);
			webgl.bindTexture(webgl.TEXTURE_2D, texture);
			webgl.texImage2D(webgl.TEXTURE_2D, 0, webgl.RGBA, webgl.RGBA, webgl.UNSIGNED_BYTE, texCanvas);
			webgl.texParameteri(webgl.TEXTURE_2D, webgl.TEXTURE_WRAP_S, webgl.REPEAT);
			webgl.texParameteri(webgl.TEXTURE_2D, webgl.TEXTURE_WRAP_T, webgl.CLAMP_TO_EDGE);
			webgl.texParameteri(webgl.TEXTURE_2D, webgl.TEXTURE_MIN_FILTER, webgl.LINEAR);
			webgl.texParameteri(webgl.TEXTURE_2D, webgl.TEXTURE_MAG_FILTER, webgl.LINEAR);
			webgl.uniform1i(uniforms.wordmark, 0);
			/* Yellowtail loads from Google Fonts after first paint, so repaint the
			   texture once the script face is ready. */
			document.fonts?.ready
				.then(() => {
					if (disposed) return;
					paintWordmarkTexture(texCanvas);
					webgl.bindTexture(webgl.TEXTURE_2D, texture);
					webgl.texImage2D(
						webgl.TEXTURE_2D,
						0,
						webgl.RGBA,
						webgl.RGBA,
						webgl.UNSIGNED_BYTE,
						texCanvas,
					);
				})
				.catch(() => {});

			const stars = createStars(180);
			const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
			const reducedMotion = motionQuery.matches;
			let width = 1;
			let height = 1;
			let starDpr = 1;
			let frame = 0;
			let visible = true;
			const startedAt = performance.now();

			const resize = () => {
				const bounds = host.getBoundingClientRect();
				width = Math.max(1, bounds.width);
				height = Math.max(1, bounds.height);
				const dpr = Math.min(window.devicePixelRatio || 1, 2);
				const bufferWidth = Math.max(1, Math.round(width * dpr));
				const bufferHeight = Math.max(1, Math.round(height * dpr));
				if (glCanvas.width !== bufferWidth || glCanvas.height !== bufferHeight) {
					glCanvas.width = bufferWidth;
					glCanvas.height = bufferHeight;
				}
				webgl.viewport(0, 0, bufferWidth, bufferHeight);
				webgl.uniform2f(uniforms.resolution, bufferWidth, bufferHeight);

				starDpr = Math.min(window.devicePixelRatio || 1, 1.5);
				const starWidth = Math.max(1, Math.round(width * starDpr));
				const starHeight = Math.max(1, Math.round(height * starDpr));
				if (starCanvas.width !== starWidth || starCanvas.height !== starHeight) {
					starCanvas.width = starWidth;
					starCanvas.height = starHeight;
				}
			};

			const drawStars = (elapsed: number) => {
				starContext.setTransform(1, 0, 0, 1, 0, 0);
				starContext.clearRect(0, 0, starCanvas.width, starCanvas.height);
				const count = Math.min(stars.length, Math.round((width * height) / 4200));
				if (!count) return;
				starContext.setTransform(starDpr, 0, 0, starDpr, 0, 0);
				starContext.globalCompositeOperation = "screen";
				for (let index = 0; index < count; index += 1) {
					const star = stars[index];
					if (!star) continue;
					const x = fract(star.x + elapsed * 0.0022 * star.drift) * width;
					const y = fract(star.y - elapsed * 0.0008 * star.depth + 1) * height;
					const twinkle = reducedMotion
						? 0.78
						: 0.58 + Math.sin(elapsed * (0.8 + star.depth) + star.phase) * 0.24;
					const alphaValue = Math.max(0.08, twinkle * (0.22 + star.depth * 0.48));
					const radius = Math.max(0.35, star.size * star.depth);
					starContext.fillStyle = `hsla(212, 62%, ${72 + star.depth * 18}%, ${alphaValue})`;
					starContext.beginPath();
					starContext.arc(x, y, radius, 0, Math.PI * 2);
					starContext.fill();
				}
				starContext.globalCompositeOperation = "source-over";
			};

			const render = (now: number) => {
				frame = 0;
				const elapsed = (now - startedAt) * 0.001;
				drawStars(reducedMotion ? STATIC_ELAPSED : elapsed);
				/* the fragment shader advances rotation at 2π/ORBIT_SECONDS rad per
				   unit of time, so seconds map straight onto the shared orbit */
				webgl.uniform1f(uniforms.time, reducedMotion ? STATIC_ELAPSED : elapsed);
				webgl.clear(webgl.COLOR_BUFFER_BIT);
				webgl.drawArrays(webgl.TRIANGLES, 0, 3);
				if (!reducedMotion && visible && !document.hidden) frame = requestAnimationFrame(render);
			};

			const start = () => {
				if (reducedMotion) {
					render(performance.now());
					return;
				}
				if (!frame && visible && !document.hidden) frame = requestAnimationFrame(render);
			};
			const stop = () => {
				if (frame) cancelAnimationFrame(frame);
				frame = 0;
			};
			const onVisibilityChange = () => {
				if (document.hidden) stop();
				else start();
			};
			const observer =
				typeof ResizeObserver !== "undefined"
					? new ResizeObserver(() => {
							resize();
							if (reducedMotion) render(performance.now());
						})
					: null;
			const intersection =
				typeof IntersectionObserver !== "undefined"
					? new IntersectionObserver(([entry]) => {
							visible = entry?.isIntersecting ?? true;
							if (visible) start();
							else stop();
						})
					: null;

			resize();
			/* paint one frame synchronously so the sphere is never blank on
			   first paint, even before the animation loop gets a slot */
			render(performance.now());
			start();
			observer?.observe(host);
			intersection?.observe(host);
			document.addEventListener("visibilitychange", onVisibilityChange);
			motionQuery.addEventListener?.("change", start);

			return () => {
				disposed = true;
				stop();
				observer?.disconnect();
				intersection?.disconnect();
				document.removeEventListener("visibilitychange", onVisibilityChange);
				motionQuery.removeEventListener?.("change", start);
				if (texture) webgl.deleteTexture(texture);
				if (buffer) webgl.deleteBuffer(buffer);
				if (program) webgl.deleteProgram(program);
				if (vertex) webgl.deleteShader(vertex);
				if (fragment) webgl.deleteShader(fragment);
			};
		} catch {
			showFallback();
			return undefined;
		}
	}, []);

	return (
		<div
			ref={hostRef}
			role="img"
			aria-label="SlideSage"
			className="pointer-events-none absolute top-1/2 left-1/2 z-10 aspect-square h-[min(86%,640px)] -translate-x-1/2 -translate-y-1/2"
		>
			<canvas ref={starCanvasRef} className="absolute inset-0 h-full w-full" />
			<canvas ref={glCanvasRef} className="absolute inset-0 h-full w-full" />
			<div
				ref={fallbackRef}
				aria-hidden="true"
				className="absolute inset-0 hidden place-items-center"
			>
				<WordmarkSvg />
			</div>
		</div>
	);
}
