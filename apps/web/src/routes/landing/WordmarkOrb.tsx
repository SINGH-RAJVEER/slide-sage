import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { WORDMARK_ORB_FRAGMENT_SHADER, WORDMARK_ORB_VERTEX_SHADER } from "./wordmark-orb-shaders";

/* The orb's rotation speed lives in the fragment shader (0.2417 rad/s), which
   spins the sphere once every 26 seconds so it revolves together with the
   slide ring. */
const STATIC_ELAPSED = 4.2;
/* pointer travel past this many pixels means a ring drag, not a sphere click */
const DRAG_CLICK_SLOP = 6;

type Star = { x: number; y: number; depth: number; phase: number; drift: number; size: number };

/* A warp particle from the Constellation Field particle-network reference:
   it spawns on a disc behind the sphere at far z and flies toward the viewer,
   drawn as a hairline streak from its previous projection to its current one. */
type Warp = {
	angle: number;
	radius: number;
	z: number;
	speed: number;
	length: number;
	color: string;
};

const WARP_DEPTH = 1000;
const WARP_FOV = 300;
/* restrained steel-white and brand-blue hues for the streaks */
const WARP_HUES = ["196, 206, 220", "86, 140, 204"];

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

function createWarps(count: number): Warp[] {
	return Array.from({ length: count }, (_, index) => ({
		angle: seeded(index, 11) * Math.PI * 2,
		radius: seeded(index, 12),
		z: 100 + seeded(index, 13) * (WARP_DEPTH - 100),
		speed: (seeded(index, 14) * 2 + 1) * 1.1,
		length: seeded(index, 15) * 2 + 0.5,
		color: WARP_HUES[seeded(index, 16) > 0.5 ? 0 : 1] ?? "196, 206, 220",
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

function has2dContext(ctx: CanvasRenderingContext2D | null): ctx is CanvasRenderingContext2D {
	return ctx !== null && typeof ctx.clearRect === "function" && typeof ctx.fillRect === "function";
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
			/* stretch the wordmark wide across its hemisphere, a touch short of
			   the limb so it reads cleanly on the sphere face */
			size = Math.floor(size * Math.min(2.1, (canvas.width * 0.26) / measured));
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
	const warpCanvasRef = useRef<HTMLCanvasElement>(null);
	const stageRef = useRef<HTMLAnchorElement>(null);
	const glCanvasRef = useRef<HTMLCanvasElement>(null);
	const fallbackRef = useRef<HTMLDivElement>(null);
	/* pointer travel across the sphere, so a ring drag never fires navigation */
	const dragStartX = useRef(0);
	const dragDistance = useRef(0);

	useEffect(() => {
		const host = hostRef.current;
		const starCanvas = starCanvasRef.current;
		const warpCanvas = warpCanvasRef.current;
		const stage = stageRef.current;
		const glCanvas = glCanvasRef.current;
		if (!host || !starCanvas || !warpCanvas || !stage || !glCanvas) return undefined;

		let disposed = false;
		const showFallback = () => {
			const fallback = fallbackRef.current;
			if (!fallback) return;
			fallback.style.display = "grid";
			starCanvas.style.display = "none";
			warpCanvas.style.display = "none";
			stage.style.display = "none";
		};

		const starContext = starCanvas.getContext("2d", { alpha: true });
		const warpContext = warpCanvas.getContext("2d", { alpha: true });
		const gl =
			glCanvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true }) ??
			glCanvas.getContext("experimental-webgl", {
				alpha: true,
				premultipliedAlpha: false,
				antialias: true,
			});
		if (!has2dContext(starContext) || !has2dContext(warpContext) || !gl) {
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
			const warps = createWarps(170);
			const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
			const reducedMotion = motionQuery.matches;
			let width = 1;
			let height = 1;
			let stageWidth = 1;
			let stageHeight = 1;
			let starDpr = 1;
			let frame = 0;
			let visible = true;
			const startedAt = performance.now();

			const resize = () => {
				const bounds = host.getBoundingClientRect();
				width = Math.max(1, bounds.width);
				height = Math.max(1, bounds.height);

				const dpr = Math.min(window.devicePixelRatio || 1, 2);
				starDpr = Math.min(window.devicePixelRatio || 1, 1.5);

				const starWidth = Math.max(1, Math.round(width * starDpr));
				const starHeight = Math.max(1, Math.round(height * starDpr));
				if (starCanvas.width !== starWidth || starCanvas.height !== starHeight) {
					starCanvas.width = starWidth;
					starCanvas.height = starHeight;
				}

				/* trails must not survive a resize as stretched ghosts */
				const warpDpr = dpr;
				const warpWidth = Math.max(1, Math.round(width * warpDpr));
				const warpHeight = Math.max(1, Math.round(height * warpDpr));
				if (warpCanvas.width !== warpWidth || warpCanvas.height !== warpHeight) {
					warpCanvas.width = warpWidth;
					warpCanvas.height = warpHeight;
				}
				warpContext.setTransform(warpDpr, 0, 0, warpDpr, 0, 0);
				warpContext.clearRect(0, 0, width, height);
				warpContext.imageSmoothingEnabled = false;

				const stageBounds = stage.getBoundingClientRect();
				stageWidth = Math.max(1, stageBounds.width);
				stageHeight = Math.max(1, stageBounds.height);
				const bufferWidth = Math.max(1, Math.round(stageWidth * dpr));
				const bufferHeight = Math.max(1, Math.round(stageHeight * dpr));
				if (glCanvas.width !== bufferWidth || glCanvas.height !== bufferHeight) {
					glCanvas.width = bufferWidth;
					glCanvas.height = bufferHeight;
				}
				webgl.viewport(0, 0, bufferWidth, bufferHeight);
				webgl.uniform2f(uniforms.resolution, bufferWidth, bufferHeight);
			};

			const drawStars = (elapsed: number) => {
				starContext.setTransform(starDpr, 0, 0, starDpr, 0, 0);
				starContext.clearRect(0, 0, starCanvas.width / starDpr, starCanvas.height / starDpr);
				const count = Math.min(stars.length, Math.round((width * height) / 4200));
				if (!count) return;
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

			/* The reference's trail technique, adapted to a transparent layer:
			   erase toward nothing each frame instead of painting background
			   colour, so streaks stay crisp over the hero gradient. */
			const drawWarps = () => {
				warpContext.save();
				warpContext.globalCompositeOperation = "destination-out";
				warpContext.fillStyle = "rgba(0, 0, 0, 0.45)";
				warpContext.fillRect(0, 0, width, height);
				warpContext.restore();

				const originX = width / 2;
				const originY = height / 2;
				const spawnRadius = Math.min(width, height) * 0.72;
				warpContext.lineCap = "butt";
				warpContext.lineJoin = "miter";
				for (const warp of warps) {
					warp.z -= warp.speed;
					if (warp.z <= 0) {
						warp.angle = Math.random() * Math.PI * 2;
						warp.radius = Math.random();
						warp.z = WARP_DEPTH;
						warp.speed = (Math.random() * 2 + 1) * 1.1;
						warp.length = Math.random() * 2 + 0.5;
					}
					const x = Math.cos(warp.angle) * warp.radius * spawnRadius;
					const y = Math.sin(warp.angle) * warp.radius * spawnRadius;
					const scale = WARP_FOV / warp.z;
					const px = originX + x * scale;
					const py = originY + y * scale;

					const prevZ = warp.z + warp.speed * warp.length;
					const prevScale = WARP_FOV / prevZ;
					const prevPx = originX + x * prevScale;
					const prevPy = originY + y * prevScale;

					let opacity = 1 - warp.z / WARP_DEPTH;
					if (warp.z > WARP_DEPTH * 0.92) opacity *= (WARP_DEPTH - warp.z) / (WARP_DEPTH * 0.08);
					if (warp.z < 100) opacity = warp.z / 100;
					if (opacity <= 0) continue;

					warpContext.beginPath();
					warpContext.moveTo(prevPx, prevPy);
					warpContext.lineTo(px, py);
					warpContext.strokeStyle = `rgba(${warp.color}, ${(opacity * 0.9).toFixed(3)})`;
					/* hairline strokes stay crisp under retina DPR scaling */
					warpContext.lineWidth = Math.max(0.25, (1 - warp.z / WARP_DEPTH) * 0.4);
					warpContext.stroke();
				}
			};

			const render = (now: number) => {
				frame = 0;
				const elapsed = reducedMotion ? STATIC_ELAPSED : (now - startedAt) * 0.001;
				drawStars(elapsed);
				drawWarps();
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
			/* paint one frame synchronously so the scene is never blank on first
			   paint, even before the animation loop gets a slot */
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
		<div ref={hostRef} className="pointer-events-none absolute inset-0 z-10">
			<canvas ref={starCanvasRef} className="absolute inset-0 h-full w-full" />
			{/* warp streaks sit directly under the sphere so they read as
			    originating from behind it */}
			<canvas ref={warpCanvasRef} className="absolute inset-0 h-full w-full" />
			{/* the sphere itself is the call to action: clicking it leads to
			    sign-up. Drag distance is tracked so grabbing the ring through
			    the sphere never fires the navigation. */}
			<Link
				to="/sign-up"
				aria-label="SlideSage — sign up"
				ref={stageRef}
				onPointerDown={(event) => {
					dragStartX.current = event.clientX;
					dragDistance.current = 0;
				}}
				onPointerMove={(event) => {
					dragDistance.current += Math.abs(event.clientX - dragStartX.current);
					dragStartX.current = event.clientX;
				}}
				onClick={(event) => {
					if (dragDistance.current > DRAG_CLICK_SLOP) event.preventDefault();
				}}
				className="pointer-events-auto absolute top-1/2 left-1/2 aspect-square h-[min(76%,560px)] -translate-x-1/2 -translate-y-1/2 cursor-pointer"
			>
				<canvas ref={glCanvasRef} className="absolute inset-0 h-full w-full" />
			</Link>
			{/* shown only when WebGL is unavailable; inline styles keep the
			    accessible tree correct in both paths */}
			<div
				ref={fallbackRef}
				style={{ display: "none" }}
				className="absolute inset-0 place-items-center"
			>
				<Link
					to="/sign-up"
					aria-label="SlideSage — sign up"
					className="grid w-full place-items-center"
				>
					<WordmarkSvg />
				</Link>
			</div>
		</div>
	);
}
