import { ScaledSlide } from "@slidesage/ui/components/Viewer/ScaledSlide";
import { SlideRenderer } from "@slidesage/ui/components/Viewer/SlideRenderer";
import { getTemplate } from "@slidesage/ui/lib/templates";
import { useEffect, useRef, useState } from "react";
import { LANDING_PLATES } from "./slide-examples";
import { WordmarkOrb } from "./WordmarkOrb";

/* Ring geometry and motion, adapted from the Gallery Heading matte gallery:
   a tilted ellipse of 16:9 plates that hold still until the pointer arrives,
   then spring into orbit. The ring can also be thrown by dragging, and any
   plate opens in a hovering preview when clicked. */
const AXIS = (-25.5 * Math.PI) / 180;
const ORBIT_SECONDS = 26;
const SPRING_K = 26;
const SPRING_D = 5.7;
/* radians of spin per pixel of horizontal drag */
const DRAG_SENSITIVITY = 1.15;
const DRAG_CLICK_SLOP = 6;
const FLICK_CLAMP = 3;

export function SlideRingHero() {
	const rootRef = useRef<HTMLDivElement>(null);
	const plateRefs = useRef<(HTMLDivElement | null)[]>([]);
	const [previewIndex, setPreviewIndex] = useState<number | null>(null);
	const [previewShown, setPreviewShown] = useState(false);
	const previewOpenRef = useRef(false);
	previewOpenRef.current = previewIndex !== null;

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

		/* drag state */
		let dragging = false;
		let dragMoved = 0;
		let dragIndex = -1;
		let lastX = 0;
		let lastT = 0;
		let dragAngularVel = 0;

		const layout = () => {
			width = root.clientWidth;
			height = root.clientHeight;
			const radiusX = Math.min(width * 0.4, 540);
			/* the plate base size only changes on resize, so layout work stays
			   out of the frame loop */
			const plateWidth = radiusX * 0.34;
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
			/* while the pointer drags the ring, the move handler owns spin */
			if (!dragging && !reducedMotion) {
				const target = previewOpenRef.current ? 0 : hovering ? 1 : 0;
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

		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as HTMLElement | null;
			const plate = target?.closest("[data-plate-index]");
			dragging = true;
			dragMoved = 0;
			dragIndex = plate?.getAttribute("data-plate-index")
				? Number.parseInt(plate.getAttribute("data-plate-index") ?? "", 10)
				: -1;
			lastX = event.clientX;
			lastT = performance.now();
			dragAngularVel = 0;
		};

		const onPointerMove = (event: PointerEvent) => {
			if (!dragging) return;
			const now = performance.now();
			const dx = event.clientX - lastX;
			const dt = Math.max(1, now - lastT);
			const radiusX = Math.min(width * 0.4, 540);
			/* negate the delta so the ring reads as grabbed: dragging right
			   pushes the front plates right */
			const dSpin = -dx / (radiusX * DRAG_SENSITIVITY);
			spin += dSpin;
			dragMoved += Math.abs(dx);
			dragAngularVel = (dSpin / dt) * 1000;
			lastX = event.clientX;
			lastT = now;
			render();
			settled = false;
		};

		const onPointerUp = () => {
			if (!dragging) return;
			dragging = false;
			if (dragMoved < DRAG_CLICK_SLOP) {
				/* a tap, not a throw: open the plate under the pointer */
				if (dragIndex >= 0) setPreviewIndex(dragIndex);
				return;
			}
			/* hand the flick to the spring, which carries the momentum and
			   eases the ring back to its resting pace */
			rate = Math.max(-FLICK_CLAMP, Math.min(FLICK_CLAMP, dragAngularVel));
			velocity = 0;
			settled = false;
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
		root.addEventListener("pointerdown", onPointerDown);
		root.addEventListener("pointerleave", onLeave);
		root.addEventListener("pointercancel", onLeave);
		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp);
		window.addEventListener("pointercancel", onPointerUp);
		window.addEventListener("blur", onBlur);
		document.addEventListener("visibilitychange", onVisibility);
		frameId = requestAnimationFrame(frame);

		return () => {
			cancelAnimationFrame(frameId);
			observer?.disconnect();
			root.removeEventListener("pointerenter", onEnter);
			root.removeEventListener("pointermove", onEnter);
			root.removeEventListener("pointerdown", onEnter);
			root.removeEventListener("pointerdown", onPointerDown);
			root.removeEventListener("pointerleave", onLeave);
			root.removeEventListener("pointercancel", onLeave);
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("pointercancel", onPointerUp);
			window.removeEventListener("blur", onBlur);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, []);

	useEffect(() => {
		if (previewIndex === null) {
			setPreviewShown(false);
			return undefined;
		}
		const frame = requestAnimationFrame(() => setPreviewShown(true));
		return () => cancelAnimationFrame(frame);
	}, [previewIndex]);

	useEffect(() => {
		if (previewIndex === null) return undefined;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setPreviewIndex(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [previewIndex]);

	const preview = previewIndex === null ? null : LANDING_PLATES[previewIndex];
	const previewTheme = preview ? getTemplate(preview.themeId) : null;
	const previewTitle =
		preview?.slide.type === "content" ? preview.slide.title : preview?.slide.chartConfig.title;

	return (
		<div
			ref={rootRef}
			role="img"
			aria-label="Slides from finished decks orbiting the SlideSage wordmark"
			className="relative h-full w-full cursor-grab select-none overflow-hidden active:cursor-grabbing"
			style={{
				background: "radial-gradient(120% 90% at 50% -20%, #252a37 0%, #161b27 60%)",
				touchAction: "pan-y",
			}}
		>
			<div aria-hidden className="pointer-events-none absolute inset-0">
				{LANDING_PLATES.map((plate, index) => (
					<div
						key={plate.id}
						data-plate-index={index}
						ref={(el) => {
							plateRefs.current[index] = el;
						}}
						className="pointer-events-auto absolute top-0 left-0 aspect-video overflow-hidden rounded-[4%] ring-1 ring-white/10 will-change-transform"
						style={{ boxShadow: "0 18px 44px rgba(0, 0, 0, 0.45)" }}
					>
						<ScaledSlide>
							<SlideRenderer slide={plate.slide} currentTemplate={plate.themeId} isActive />
						</ScaledSlide>
					</div>
				))}
			</div>
			{/* The wordmark lives on a rotating smoke sphere (see WordmarkOrb);
			    the ring's plates pass over it, and it stays clear of the preview
			    dialog at z-30. */}
			<WordmarkOrb />

			{preview && previewTheme && (
				<div
					role="dialog"
					aria-modal="true"
					aria-label={`Slide preview: ${previewTheme.name}`}
					className="absolute inset-0 z-30 flex items-center justify-center"
				>
					<button
						type="button"
						aria-label="Close preview"
						onClick={() => setPreviewIndex(null)}
						className={`absolute inset-0 cursor-default bg-[#0c0f16]/70 backdrop-blur-sm transition-opacity duration-300 ${
							previewShown ? "opacity-100" : "opacity-0"
						}`}
					/>
					<div
						className={`relative z-10 aspect-video w-[68%] max-w-[880px] transition-all duration-300 ease-out ${
							previewShown ? "scale-100 opacity-100" : "scale-95 opacity-0"
						}`}
					>
						<div className="h-full w-full overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/15">
							<ScaledSlide>
								<SlideRenderer slide={preview.slide} currentTemplate={preview.themeId} isActive />
							</ScaledSlide>
						</div>
						<p className="mt-4 text-center text-xs tracking-wide text-white/50">
							{previewTheme.name}
							{previewTitle ? ` · ${previewTitle}` : ""}
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
