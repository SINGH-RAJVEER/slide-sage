import {
	type ContentSlide,
	resolveSlideSupportVisual,
	SCENE_GRID_SIZE,
	type SlideBlock,
	type SlideObjectBounds,
} from "@slidesage/types";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { BackgroundImageEditor } from "./BackgroundImageEditor";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "./ScaledSlide";
import { SlideRenderer } from "./SlideRenderer";

interface EditableSlideCanvasProps {
	slide: ContentSlide;
	currentTemplate: string;
	onChange: (slide: ContentSlide) => void;
}

type ContentTarget =
	| { kind: "title"; key: "title" }
	| { kind: "subtitle"; key: "subtitle" }
	| { kind: "block"; key: string; blockId: string };

interface DragState {
	target: ContentTarget;
	interaction: "move" | "top-left" | "top-right" | "bottom-right" | "bottom-left";
	pointerId: number;
	startPointer: { x: number; y: number };
	startBounds: SlideObjectBounds;
	currentBounds: SlideObjectBounds;
	didMove: boolean;
}

function snap(value: number) {
	return Math.round(value / SCENE_GRID_SIZE) * SCENE_GRID_SIZE;
}

function snapExtent(value: number) {
	return Math.max(SCENE_GRID_SIZE, snap(value));
}

function clamp(value: number, minimum: number, maximum: number) {
	return Math.min(Math.max(value, minimum), maximum);
}

function alignedBounds(bounds: SlideObjectBounds): SlideObjectBounds {
	return {
		x: snap(bounds.x),
		y: snap(bounds.y),
		width: snapExtent(bounds.width),
		height: snapExtent(bounds.height),
	};
}

function moveBounds(bounds: SlideObjectBounds, delta: { x: number; y: number }): SlideObjectBounds {
	const width = snapExtent(bounds.width);
	const height = snapExtent(bounds.height);
	return {
		x: clamp(snap(bounds.x + delta.x), 0, SLIDE_WIDTH - width),
		y: clamp(snap(bounds.y + delta.y), 0, SLIDE_HEIGHT - height),
		width,
		height,
	};
}

function resizeBounds(
	bounds: SlideObjectBounds,
	delta: { x: number; y: number },
	corner: Exclude<DragState["interaction"], "move">,
): SlideObjectBounds {
	const start = alignedBounds(bounds);
	const right = start.x + start.width;
	const bottom = start.y + start.height;
	const left = corner.includes("left")
		? clamp(snap(start.x + delta.x), 0, right - SCENE_GRID_SIZE)
		: start.x;
	const nextRight = corner.includes("right")
		? clamp(snap(right + delta.x), start.x + SCENE_GRID_SIZE, SLIDE_WIDTH)
		: right;
	const top = corner.includes("top")
		? clamp(snap(start.y + delta.y), 0, bottom - SCENE_GRID_SIZE)
		: start.y;
	const nextBottom = corner.includes("bottom")
		? clamp(snap(bottom + delta.y), start.y + SCENE_GRID_SIZE, SLIDE_HEIGHT)
		: bottom;
	return { x: left, y: top, width: nextRight - left, height: nextBottom - top };
}

function measuredBounds(element: HTMLElement, shell: HTMLElement): SlideObjectBounds | undefined {
	const shellRect = shell.getBoundingClientRect();
	const object = element.closest<HTMLElement>("[data-content-object-id]") || element;
	const objectRect = object.getBoundingClientRect();
	if (!shellRect.width || !shellRect.height || !objectRect.width || !objectRect.height) return;
	return alignedBounds({
		x: ((objectRect.left - shellRect.left) * SLIDE_WIDTH) / shellRect.width,
		y: ((objectRect.top - shellRect.top) * SLIDE_HEIGHT) / shellRect.height,
		width: (objectRect.width * SLIDE_WIDTH) / shellRect.width,
		height: (objectRect.height * SLIDE_HEIGHT) / shellRect.height,
	});
}

export function EditableSlideCanvas({
	slide,
	currentTemplate,
	onChange,
}: EditableSlideCanvasProps) {
	const [draft, setDraft] = useState(() => structuredClone(slide));
	const [selectedTarget, setSelectedTarget] = useState<ContentTarget>();
	const [editingTarget, setEditingTarget] = useState<string>();
	const [previewBounds, setPreviewBounds] = useState<SlideObjectBounds>();
	const [isDragging, setIsDragging] = useState(false);
	const shellRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<DragState | undefined>(undefined);

	useEffect(() => {
		setDraft(structuredClone(slide));
		setSelectedTarget(undefined);
		setEditingTarget(undefined);
		setPreviewBounds(undefined);
		setIsDragging(false);
	}, [slide.id]);

	useEffect(() => {
		if (!editingTarget) return;
		const closeOnOutsidePointer = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (
				shellRef.current
					?.querySelector(".ss-inplace-input:focus, .ss-inplace-text:focus")
					?.contains(target)
			) {
				return;
			}
			if (target instanceof Element && target.closest(".ss-background-editor")) return;
			setEditingTarget(undefined);
		};
		document.addEventListener("pointerdown", closeOnOutsidePointer, true);
		return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
	}, [editingTarget]);

	const emitDraft = (update: (current: ContentSlide) => ContentSlide) => {
		setDraft((current) => {
			const updated = update(current);
			onChange(updated);
			return updated;
		});
	};

	const updateBlock = (block: SlideBlock) => {
		emitDraft((current) => ({
			...current,
			blocks: current.blocks.map((item) => (item.id === block.id ? block : item)),
		}));
	};

	const updateBounds = (target: ContentTarget, bounds: SlideObjectBounds) => {
		emitDraft((current) => {
			if (target.kind === "title") return { ...current, titleBounds: bounds };
			if (target.kind === "subtitle") return { ...current, subtitleBounds: bounds };
			return {
				...current,
				blocks: current.blocks.map((block) =>
					block.id === target.blockId ? { ...block, bounds } : block,
				),
			};
		});
	};

	useEffect(() => {
		const move = (event: PointerEvent) => {
			const drag = dragRef.current;
			const shell = shellRef.current;
			if (!drag || !shell || event.pointerId !== drag.pointerId) return;
			const rect = shell.getBoundingClientRect();
			if (!rect.width || !rect.height) return;
			const pointer = {
				x: ((event.clientX - rect.left) * SLIDE_WIDTH) / rect.width,
				y: ((event.clientY - rect.top) * SLIDE_HEIGHT) / rect.height,
			};
			const delta = {
				x: pointer.x - drag.startPointer.x,
				y: pointer.y - drag.startPointer.y,
			};
			const next =
				drag.interaction === "move"
					? moveBounds(drag.startBounds, delta)
					: resizeBounds(drag.startBounds, delta, drag.interaction);
			drag.didMove ||= Object.keys(next).some(
				(key) =>
					next[key as keyof SlideObjectBounds] !== drag.startBounds[key as keyof SlideObjectBounds],
			);
			drag.currentBounds = next;
			setPreviewBounds(next);
		};
		const end = (event: PointerEvent) => {
			const drag = dragRef.current;
			if (!drag || event.pointerId !== drag.pointerId) return;
			dragRef.current = undefined;
			setIsDragging(false);
			setPreviewBounds(drag.currentBounds);
			if (drag.didMove) updateBounds(drag.target, drag.currentBounds);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", end);
		window.addEventListener("pointercancel", end);
		return () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", end);
			window.removeEventListener("pointercancel", end);
		};
	}, []);

	const selectObject = (target: ContentTarget, element: HTMLElement) => {
		const shell = shellRef.current;
		if (!shell) return;
		if (selectedTarget?.key === target.key) {
			setEditingTarget(target.key);
			return;
		}
		const bounds = measuredBounds(element, shell);
		if (!bounds) return;
		setSelectedTarget(target);
		setEditingTarget(undefined);
		setPreviewBounds(bounds);
	};

	const beginDrag = (
		event: ReactPointerEvent<HTMLElement>,
		interaction: DragState["interaction"] = "move",
	) => {
		const shell = shellRef.current;
		if (!shell || !selectedTarget || !previewBounds || editingTarget) return;
		const rect = shell.getBoundingClientRect();
		if (!rect.width || !rect.height) return;
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture?.(event.pointerId);
		setIsDragging(true);
		dragRef.current = {
			target: selectedTarget,
			interaction,
			pointerId: event.pointerId,
			startBounds: previewBounds,
			currentBounds: previewBounds,
			didMove: false,
			startPointer: {
				x: ((event.clientX - rect.left) * SLIDE_WIDTH) / rect.width,
				y: ((event.clientY - rect.top) * SLIDE_HEIGHT) / rect.height,
			},
		};
	};

	const supportVisual = resolveSlideSupportVisual(draft);
	useEffect(() => {
		const shell = shellRef.current;
		if (!shell) return;
		const selectBackground = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			if (
				target.closest(
					"[data-content-object-id], .ss-content-selection, .ss-background-editor, input, textarea, button, [role='button']",
				)
			) {
				return;
			}
			if (!target.closest("[data-layout]")) return;
			setSelectedTarget(undefined);
			setPreviewBounds(undefined);
			setEditingTarget(supportVisual ? "background" : undefined);
		};
		shell.addEventListener("click", selectBackground);
		return () => shell.removeEventListener("click", selectBackground);
	}, [supportVisual?.block.id]);

	return (
		<div ref={shellRef} className="ss-edit-shell ss-content-edit-shell">
			<SlideRenderer
				slide={draft}
				currentTemplate={currentTemplate}
				isActive
				editingTarget={editingTarget}
				onSelectTitle={(element) => selectObject({ kind: "title", key: "title" }, element)}
				onSelectSubtitle={(element) => selectObject({ kind: "subtitle", key: "subtitle" }, element)}
				onSelectBlock={(block, element) =>
					block.id && selectObject({ kind: "block", key: block.id, blockId: block.id }, element)
				}
				onEditTitle={(title) => emitDraft((current) => ({ ...current, title }))}
				onEditSubtitle={(subtitle) => emitDraft((current) => ({ ...current, subtitle }))}
				onEditBlock={updateBlock}
			/>
			{isDragging && <div aria-hidden="true" className="ss-scene-grid" />}
			{selectedTarget && previewBounds && (
				<div
					aria-hidden="true"
					className="ss-scene-selection ss-content-selection"
					style={{
						left: previewBounds.x,
						top: previewBounds.y,
						width: previewBounds.width,
						height: previewBounds.height,
					}}
				>
					{isDragging &&
						["top-left", "top-right", "bottom-right", "bottom-left"].map((corner) => (
							<div
								key={corner}
								data-content-snap-corner={corner}
								className={`ss-scene-snap-corner ss-scene-snap-corner--${corner}`}
							/>
						))}
					{["top", "right", "bottom", "left"].map((edge) => (
						<div
							key={edge}
							data-content-selection-border={edge}
							className={`ss-scene-selection-border ss-scene-selection-border--${edge}`}
							onPointerDown={(event) => beginDrag(event)}
						/>
					))}
					{["top-left", "top-right", "bottom-right", "bottom-left"].map((corner) => (
						<div
							key={corner}
							data-content-resize-handle={corner}
							className={`ss-scene-resize-handle ss-scene-resize-handle--${corner}`}
							onPointerDown={(event) =>
								beginDrag(event, corner as Exclude<DragState["interaction"], "move">)
							}
						/>
					))}
				</div>
			)}
			{editingTarget === "background" && supportVisual && (
				<BackgroundImageEditor
					block={supportVisual.block}
					onChange={updateBlock}
					onClose={() => setEditingTarget(undefined)}
				/>
			)}
		</div>
	);
}
