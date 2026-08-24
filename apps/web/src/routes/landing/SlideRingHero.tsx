import { getTemplate, type ThemeVisualSystem } from "@slidesage/ui/lib/templates";
import { useEffect, useRef } from "react";
import { SLIDE_EXAMPLES, type SlideExample } from "./slide-examples";

/* Painted-plate geometry. Plates are 4:3, painted once at startup, and only
   ever drawn as finished images afterwards. */
const TILE_WIDTH = 640;
const TILE_HEIGHT = 480;
const AXIS = (-25.5 * Math.PI) / 180;
const ORBIT_SECONDS = 26;
const SPRING_K = 26;
const SPRING_D = 5.7;
const BRAND_FONT = '"Helvetica Neue",Helvetica,Inter,system-ui,sans-serif';

function rng(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};
}

/* Value noise on a 64x64 lattice, smoothstep-interpolated and wrapped: the
   same matte field the reference shades its plates with. */
function noiseField(seed: number) {
	const grid = new Float32Array(4096);
	const random = rng(seed);
	for (let i = 0; i < 4096; i++) grid[i] = random();
	return (x: number, y: number) => {
		const x0 = Math.floor(x);
		const y0 = Math.floor(y);
		let fx = x - x0;
		let fy = y - y0;
		fx = fx * fx * (3 - 2 * fx);
		fy = fy * fy * (3 - 2 * fy);
		const rowA = (y0 & 63) * 64;
		const rowB = ((y0 + 1) & 63) * 64;
		const colA = x0 & 63;
		const colB = (x0 + 1) & 63;
		const a = grid[rowA + colA] ?? 0;
		const b = grid[rowA + colB] ?? 0;
		const c = grid[rowB + colA] ?? 0;
		const d = grid[rowB + colB] ?? 0;
		return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
	};
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves: number) {
	let value = 0;
	let amplitude = 0.5;
	let frequency = 1;
	let total = 0;
	for (let i = 0; i < octaves; i++) {
		value += amplitude * noise(x * frequency, y * frequency);
		total += amplitude;
		amplitude *= 0.5;
		frequency *= 2;
	}
	return value / total;
}

function rgbOf(hex: string): [number, number, number] {
	const value = Number.parseInt(hex.slice(1), 16);
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixRgb(
	a: [number, number, number],
	b: [number, number, number],
	t: number,
): [number, number, number] {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function roundRectPath(
	c: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
) {
	c.beginPath();
	c.moveTo(x + r, y);
	c.arcTo(x + w, y, x + w, y + h, r);
	c.arcTo(x + w, y + h, x, y + h, r);
	c.arcTo(x, y + h, x, y, r);
	c.arcTo(x, y, x + w, y, r);
	c.closePath();
}

function setFont(c: CanvasRenderingContext2D, weight: number, size: number, family: string) {
	c.font = `${weight} ${size}px ${family}`;
}

function truncate(c: CanvasRenderingContext2D, text: string, maxWidth: number) {
	if (c.measureText(text).width <= maxWidth) return text;
	let clipped = text;
	while (clipped.length > 1 && c.measureText(`${clipped}...`).width > maxWidth) {
		clipped = clipped.slice(0, -1);
	}
	return `${clipped}...`;
}

function wrapLines(
	c: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
	maxLines: number,
): { lines: string[]; overflow: boolean } {
	const words = text.split(" ");
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (c.measureText(candidate).width <= maxWidth || !current) {
			current = candidate;
		} else {
			lines.push(current);
			current = word;
			if (lines.length === maxLines) break;
		}
	}
	let overflow = false;
	if (lines.length < maxLines) {
		if (current) lines.push(current);
	} else {
		/* the loop broke early: words did not fit within the line budget */
		overflow = true;
	}
	const last = lines[lines.length - 1];
	if (last && c.measureText(last).width > maxWidth) overflow = true;
	return { lines, overflow };
}

/* One matte plate: the theme's flat background under a slow rise of noise,
   then the slide's own content set in the theme's type and palette. */
function paintTile(example: SlideExample, index: number): HTMLCanvasElement | null {
	const tile = document.createElement("canvas");
	tile.width = TILE_WIDTH;
	tile.height = TILE_HEIGHT;
	const c = tile.getContext("2d");
	if (!c) return null;

	const visual: ThemeVisualSystem = getTemplate(example.themeId).visual;
	const pad = 56;

	/* matte field: paint low-resolution noise, then blow it up over the tile */
	const noise = noiseField(0x2c41 + index * 9176);
	const base = rgbOf(visual.background);
	const hi = mixRgb(base, [255, 255, 255], 0.07);
	const lo = mixRgb(base, [0, 0, 0], 0.12);
	const buffer = document.createElement("canvas");
	buffer.width = 160;
	buffer.height = 120;
	const bx = buffer.getContext("2d");
	if (!bx) return null;
	const image = bx.createImageData(160, 120);
	for (let py = 0; py < 120; py++) {
		for (let px = 0; px < 160; px++) {
			const u = (px + 0.5) / 160;
			const v = (py + 0.5) / 120;
			let s = 0.5 + (fbm(noise, u * 6.5, v * 6.5, 5) - 0.5) * 1.4 + (v - 0.5) * 0.08;
			s = s < 0 ? 0 : s > 1 ? 1 : s;
			const shaded = s < 0.5 ? mixRgb(lo, base, s * 2) : mixRgb(base, hi, (s - 0.5) * 2);
			const o = (py * 160 + px) * 4;
			image.data[o] = shaded[0];
			image.data[o + 1] = shaded[1];
			image.data[o + 2] = shaded[2];
			image.data[o + 3] = 255;
		}
	}
	bx.putImageData(image, 0, 0);
	c.imageSmoothingEnabled = true;
	c.drawImage(buffer, 0, 0, TILE_WIDTH, TILE_HEIGHT);

	/* eyebrow with a small accent mark */
	setFont(c, 600, 21, visual.bodyFont);
	if (c.letterSpacing !== undefined) c.letterSpacing = "3px";
	c.fillStyle = visual.accent;
	c.fillRect(pad, pad + 4, 14, 14);
	c.fillText(
		truncate(c, example.eyebrow.toUpperCase(), TILE_WIDTH - pad * 2 - 30),
		pad + 30,
		pad + 17,
	);
	if (c.letterSpacing !== undefined) c.letterSpacing = "0px";

	/* title in the theme's display face: shrink until it fits two lines,
	   and only then fall back to an ellipsis */
	const titleTop = pad + 66;
	let titleSize = 48;
	let titleLines = [example.title];
	for (const size of [78, 66, 56, 48]) {
		setFont(c, visual.displayWeight, size, visual.displayFont);
		const fitted = wrapLines(c, example.title, TILE_WIDTH - pad * 2, 2);
		titleSize = size;
		titleLines = fitted.overflow
			? wrapLines(c, `${example.title}...`, TILE_WIDTH - pad * 2, 2).lines
			: fitted.lines;
		if (!fitted.overflow || size === 48) break;
	}
	titleLines.forEach((line, i) => {
		c.fillStyle = visual.title;
		c.fillText(line, pad, titleTop + i * titleSize * 1.08);
	});

	/* subtitle under the title */
	const subtitleY = titleTop + titleLines.length * titleSize * 1.08 + 14;
	setFont(c, 400, 25, visual.bodyFont);
	c.fillStyle = visual.muted;
	c.fillText(truncate(c, example.subtitle, TILE_WIDTH - pad * 2), pad, subtitleY);

	/* lower content: a hairline, then the slide's stats or bullet lines */
	const contentTop = TILE_HEIGHT - 148;
	c.fillStyle = visual.line;
	c.globalAlpha = 0.6;
	c.fillRect(pad, contentTop, TILE_WIDTH - pad * 2, 2);
	c.globalAlpha = 1;

	if (example.stats?.length) {
		const slot = (TILE_WIDTH - pad * 2) / Math.min(example.stats.length, 3);
		example.stats.slice(0, 3).forEach((stat, i) => {
			const x = pad + i * slot;
			setFont(c, visual.displayWeight, 52, visual.displayFont);
			c.fillStyle = visual.title;
			c.fillText(stat.value, x, contentTop + 66);
			setFont(c, 400, 20, visual.bodyFont);
			c.fillStyle = visual.muted;
			c.fillText(truncate(c, stat.label, slot - 24), x, contentTop + 100);
		});
	} else if (example.lines?.length) {
		example.lines.slice(0, 3).forEach((line, i) => {
			const y = contentTop + 42 + i * 36;
			c.fillStyle = visual.accent;
			c.fillRect(pad, y - 9, 20, 5);
			setFont(c, 400, 25, visual.bodyFont);
			c.fillStyle = visual.title;
			c.fillText(truncate(c, line, TILE_WIDTH - pad * 2 - 40), pad + 40, y);
		});
	}

	/* grain fine enough to read as the surface rather than as an effect */
	const grainRandom = rng(0x51b7 + index * 30011);
	const grain = document.createElement("canvas");
	grain.width = 96;
	grain.height = 96;
	const gx = grain.getContext("2d");
	if (gx) {
		const grainImage = gx.createImageData(96, 96);
		for (let i = 0; i < 96 * 96; i++) {
			const v = (grainRandom() * 255) | 0;
			grainImage.data[i * 4] = v;
			grainImage.data[i * 4 + 1] = v;
			grainImage.data[i * 4 + 2] = v;
			grainImage.data[i * 4 + 3] = 255;
		}
		gx.putImageData(grainImage, 0, 0);
		c.save();
		c.globalCompositeOperation = "overlay";
		c.globalAlpha = 0.08;
		c.fillStyle = c.createPattern(grain, "repeat") ?? visual.background;
		c.fillRect(0, 0, TILE_WIDTH, TILE_HEIGHT);
		c.restore();
	}

	return tile;
}

export function SlideRingHero() {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return undefined;
		const c = canvas.getContext("2d");
		if (!c) return undefined;

		const tiles = SLIDE_EXAMPLES.map((example, index) => paintTile(example, index)).filter(
			(tile): tile is HTMLCanvasElement => tile !== null,
		);
		if (!tiles.length) return undefined;

		const reducedMotion =
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		let width = 0;
		let height = 0;
		let spin = 0;
		let rate = 0;
		let velocity = 0;
		let hovering = false;
		let settled = false;
		let last = performance.now();
		let frameId = 0;

		const resize = () => {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			width = canvas.clientWidth;
			height = canvas.clientHeight;
			canvas.width = Math.max(1, Math.round(width * dpr));
			canvas.height = Math.max(1, Math.round(height * dpr));
			c.setTransform(dpr, 0, 0, dpr, 0, 0);
		};

		const drawBackground = () => {
			/* the SlideSage signature: deep navy with one soft glow at the top */
			c.fillStyle = "#161b27";
			c.fillRect(0, 0, width, height);
			const glow = c.createRadialGradient(
				width / 2,
				-height * 0.35,
				0,
				width / 2,
				-height * 0.35,
				height * 1.25,
			);
			glow.addColorStop(0, "rgba(37, 42, 55, 0.9)");
			glow.addColorStop(1, "rgba(37, 42, 55, 0)");
			c.fillStyle = glow;
			c.fillRect(0, 0, width, height);
		};

		const drawWordmark = () => {
			/* fit the wordmark inside the ring: never wider than 52% of the frame,
			   so the plates at the ellipse's extremes clear it at rest */
			let size = Math.min(width * 0.148, 190);
			setFont(c, 640, size, BRAND_FONT);
			if (c.letterSpacing !== undefined) c.letterSpacing = `${(-size * 0.015).toFixed(2)}px`;
			const label = "slidesage";
			const maxWidth = width * 0.52;
			const textWidth = c.measureText(label).width;
			if (textWidth > maxWidth) {
				size *= maxWidth / textWidth;
				setFont(c, 640, size, BRAND_FONT);
				if (c.letterSpacing !== undefined) c.letterSpacing = `${(-size * 0.015).toFixed(2)}px`;
			}
			const fittedWidth = c.measureText(label).width;
			c.fillStyle = "#f3f5f7";
			c.shadowColor = "rgba(0, 0, 0, 0.45)";
			c.shadowBlur = size * 0.35;
			c.fillText(label, (width - fittedWidth) / 2, height / 2 + size * 0.34);
			c.shadowBlur = 0;
			if (c.letterSpacing !== undefined) c.letterSpacing = "0px";
		};

		const drawPlate = (
			tile: HTMLCanvasElement,
			cx: number,
			cy: number,
			radiusX: number,
			radiusY: number,
			angle: number,
		) => {
			const depth = (Math.sin(angle) + 1) / 2;
			const ringX = Math.cos(angle) * radiusX;
			const ringY = Math.sin(angle) * radiusY;
			const x = cx + ringX * Math.cos(AXIS) - ringY * Math.sin(AXIS);
			const y = cy + ringX * Math.sin(AXIS) + ringY * Math.cos(AXIS);
			const scale = 0.68 + 0.32 * depth;
			const plateWidth = radiusX * 0.42 * scale;
			const plateHeight = plateWidth * 0.75;

			c.save();
			c.globalAlpha = 0.42 + 0.58 * depth;
			c.shadowColor = "rgba(0, 0, 0, 0.4)";
			c.shadowBlur = 26 * scale;
			c.shadowOffsetY = 10 * scale;
			roundRectPath(
				c,
				x - plateWidth / 2,
				y - plateHeight / 2,
				plateWidth,
				plateHeight,
				plateWidth * 0.055,
			);
			c.fillStyle = "#000";
			c.fill();
			c.shadowColor = "transparent";
			c.clip();
			c.drawImage(tile, x - plateWidth / 2, y - plateHeight / 2, plateWidth, plateHeight);
			c.restore();
			c.save();
			c.globalAlpha = 0.1 + 0.12 * depth;
			c.strokeStyle = "#ffffff";
			c.lineWidth = 1;
			roundRectPath(
				c,
				x - plateWidth / 2,
				y - plateHeight / 2,
				plateWidth,
				plateHeight,
				plateWidth * 0.055,
			);
			c.stroke();
			c.restore();
			return depth;
		};

		const render = () => {
			const cx = width / 2;
			const cy = height / 2;
			const radiusX = Math.min(width * 0.4, 520);
			const radiusY = radiusX * 0.36;
			const count = tiles.length;

			drawBackground();

			const order = Array.from({ length: count }, (_, i) => {
				const angle = (i / count) * Math.PI * 2 + spin;
				return { i, angle, depth: (Math.sin(angle) + 1) / 2 };
			}).sort((a, b) => a.depth - b.depth);

			let wordmarkDrawn = false;
			for (const plate of order) {
				if (!wordmarkDrawn && plate.depth >= 0.5) {
					drawWordmark();
					wordmarkDrawn = true;
				}
				drawPlate(tiles[plate.i] as HTMLCanvasElement, cx, cy, radiusX, radiusY, plate.angle);
			}
			if (!wordmarkDrawn) drawWordmark();
		};

		const frame = (now: number) => {
			const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
			last = now;
			if (!reducedMotion) {
				const target = hovering ? 1 : 0;
				velocity += ((target - rate) * SPRING_K - velocity * SPRING_D) * dt;
				rate += velocity * dt;
				if (Math.abs(rate) > 0.0004 || Math.abs(velocity) > 0.0004) {
					spin += (dt * rate) / ORBIT_SECONDS;
					render();
					settled = false;
				} else if (!settled) {
					rate = 0;
					velocity = 0;
					render();
					settled = true;
				}
			}
			frameId = requestAnimationFrame(frame);
		};

		const setHover = (state: boolean) => {
			hovering = state;
		};
		const onPointerEnter = () => setHover(true);
		const onPointerLeave = () => setHover(false);
		const onBlur = () => setHover(false);
		const onVisibility = () => {
			last = performance.now();
		};

		const observer =
			typeof ResizeObserver !== "undefined"
				? new ResizeObserver(() => {
						resize();
						render();
					})
				: null;

		resize();
		render();
		observer?.observe(canvas);
		canvas.addEventListener("pointerenter", onPointerEnter);
		canvas.addEventListener("pointermove", onPointerEnter);
		canvas.addEventListener("pointerdown", onPointerEnter);
		canvas.addEventListener("pointerleave", onPointerLeave);
		canvas.addEventListener("pointercancel", onPointerLeave);
		window.addEventListener("blur", onBlur);
		document.addEventListener("visibilitychange", onVisibility);
		frameId = requestAnimationFrame(frame);

		return () => {
			cancelAnimationFrame(frameId);
			observer?.disconnect();
			canvas.removeEventListener("pointerenter", onPointerEnter);
			canvas.removeEventListener("pointermove", onPointerEnter);
			canvas.removeEventListener("pointerdown", onPointerEnter);
			canvas.removeEventListener("pointerleave", onPointerLeave);
			canvas.removeEventListener("pointercancel", onPointerLeave);
			window.removeEventListener("blur", onBlur);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, []);

	return (
		<canvas
			ref={canvasRef}
			role="img"
			aria-label="Static slides from finished decks orbiting the SlideSage wordmark"
			className="h-full w-full"
		/>
	);
}
