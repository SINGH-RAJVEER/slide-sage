import { ScaledSlide } from "@slidesage/ui/components/Viewer/ScaledSlide";
import { SlideRenderer } from "@slidesage/ui/components/Viewer/SlideRenderer";
import { useEffect, useRef } from "react";
import { LANDING_PLATES } from "./slide-examples";

/* Ring geometry and motion, adapted from the Gallery Heading matte gallery:
   a tilted ellipse of 4:3 plates that hold still until the pointer arrives,
   then spring into orbit. */
const AXIS = (-25.5 * Math.PI) / 180;
const ORBIT_SECONDS = 26;
const SPRING_K = 26;
const SPRING_D = 5.7;

export function SlideRingHero() {
	const rootRef = useRef<HTMLDivElement>(null);
	const plateRefs = useRef<(HTMLDivElement | null)[]>([]);

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return undefined;
		const plates = plateRefs.current.filter((plate): plate is HTMLDivElement => plate !== null);
		if (!plates.length) return undefined;

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

		const layout = () => {
			width = root.clientWidth;
			height = root.clientHeight;
			const radiusX = Math.min(width * 0.4, 540);
			/* the plate base size only changes on resize, so layout work stays
			   out of the frame loop */
			const plateWidth = radiusX * 0.38;
			for (const plate of plates) {
				plate.style.width = `${plateWidth}px`;
			}
		};

		const render = () => {
			const cx = width / 2;
			const cy = height / 2;
			const radiusX = Math.min(width * 0.4, 540);
			const radiusY = radiusX * 0.36;
			const cosAxis = Math.cos(AXIS);
			const sinAxis = Math.sin(AXIS);
			const count = plates.length;

			for (let i = 0; i < count; i++) {
				const plate = plates[i];
				if (!plate) continue;
				const angle = (i / count) * Math.PI * 2 + spin;
				const depth = (Math.sin(angle) + 1) / 2;
				const ringX = Math.cos(angle) * radiusX;
				const ringY = Math.sin(angle) * radiusY;
				const x = cx + ringX * cosAxis - ringY * sinAxis;
				const y = cy + ringX * sinAxis + ringY * cosAxis;
				const scale = 0.62 + 0.38 * depth;
				plate.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
				plate.style.opacity = String(0.42 + 0.58 * depth);
				plate.style.zIndex = String(Math.round(depth * 20) + (depth >= 0.5 ? 1 : 0));
			}
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
		const onEnter = () => setHover(true);
		const onLeave = () => setHover(false);
		const onBlur = () => setHover(false);
		const onVisibility = () => {
			last = performance.now();
		};

		const observer =
			typeof ResizeObserver !== "undefined"
				? new ResizeObserver(() => {
						layout();
						render();
					})
				: null;

		layout();
		render();
		observer?.observe(root);
		root.addEventListener("pointerenter", onEnter);
		root.addEventListener("pointermove", onEnter);
		root.addEventListener("pointerdown", onEnter);
		root.addEventListener("pointerleave", onLeave);
		root.addEventListener("pointercancel", onLeave);
		window.addEventListener("blur", onBlur);
		document.addEventListener("visibilitychange", onVisibility);
		frameId = requestAnimationFrame(frame);

		return () => {
			cancelAnimationFrame(frameId);
			observer?.disconnect();
			root.removeEventListener("pointerenter", onEnter);
			root.removeEventListener("pointermove", onEnter);
			root.removeEventListener("pointerdown", onEnter);
			root.removeEventListener("pointerleave", onLeave);
			root.removeEventListener("pointercancel", onLeave);
			window.removeEventListener("blur", onBlur);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, []);

	return (
		<div
			ref={rootRef}
			role="img"
			aria-label="Slides from finished decks orbiting the SlideSage wordmark"
			className="relative h-full w-full overflow-hidden"
			style={{
				background: "radial-gradient(120% 90% at 50% -20%, #252a37 0%, #161b27 60%)",
			}}
		>
			<div aria-hidden className="pointer-events-none absolute inset-0">
				{LANDING_PLATES.map((plate, index) => (
					<div
						key={plate.id}
						ref={(el) => {
							plateRefs.current[index] = el;
						}}
						className="absolute top-0 left-0 aspect-video overflow-hidden rounded-[4%] ring-1 ring-white/10 will-change-transform"
						style={{ boxShadow: "0 18px 44px rgba(0, 0, 0, 0.45)" }}
					>
						<ScaledSlide>
							<SlideRenderer slide={plate.slide} currentTemplate={plate.themeId} isActive />
						</ScaledSlide>
					</div>
				))}
			</div>
			<img
				src="/icon.webp"
				alt="SlideSage"
				className="pointer-events-none absolute top-1/2 left-1/2 z-10 w-[52%] max-w-[620px] -translate-x-1/2 -translate-y-1/2"
				style={{
					filter:
						"drop-shadow(0 0 14px rgba(110, 165, 255, 0.5)) drop-shadow(0 0 44px rgba(110, 165, 255, 0.3))",
				}}
			/>
		</div>
	);
}
