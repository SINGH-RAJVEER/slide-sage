import {
	applySceneCommand,
	type ResolvedSceneNode,
	SCENE_GRID_SIZE,
	type SceneRect,
	type SceneSlide,
} from "@slidesage/types";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "./ScaledSlide";
import { SceneRenderer } from "./SceneRenderer";

interface SelectedObject {
	node: ResolvedSceneNode;
	parent: ResolvedSceneNode;
}

interface DragState extends SelectedObject {
	interaction: "move" | "top-left" | "top-right" | "bottom-right" | "bottom-left";
	pointerId: number;
	startPointer: { x: number; y: number };
	startBounds: SceneRect;
	didMove: boolean;
}

interface ResolvedSceneGroup extends ResolvedSceneNode {
	layout: "absolute" | "stack" | "grid" | "overlay";
	padding?: { top?: number; right?: number; bottom?: number; left?: number };
	children: ResolvedSceneNode[];
}

interface EditableSceneCanvasProps {
	slide: SceneSlide;
	currentTemplate: string;
	onChange: (slide: SceneSlide) => void;
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

function parentContentOrigin(parent: ResolvedSceneGroup) {
	return {
		x: parent.bounds.x + (parent.padding?.left || 0),
		y: parent.bounds.y + (parent.padding?.top || 0),
	};
}

function localBounds(node: ResolvedSceneNode, parent: ResolvedSceneGroup): SceneRect {
	const origin = parentContentOrigin(parent);
	return {
		x: node.bounds.x - origin.x,
		y: node.bounds.y - origin.y,
		width: node.bounds.width,
		height: node.bounds.height,
	};
}

function alignedBounds(bounds: SceneRect): SceneRect {
	return {
		x: snap(bounds.x),
		y: snap(bounds.y),
		width: snapExtent(bounds.width),
		height: snapExtent(bounds.height),
	};
}

function moveBounds(bounds: SceneRect, delta: { x: number; y: number }): SceneRect {
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
	bounds: SceneRect,
	delta: { x: number; y: number },
	corner: Exclude<DragState["interaction"], "move">,
): SceneRect {
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

export function EditableSceneCanvas({
	slide,
	currentTemplate,
	onChange,
}: EditableSceneCanvasProps) {
	const [draft, setDraft] = useState(() => structuredClone(slide));
	const [selectedObject, setSelectedObject] = useState<SelectedObject>();
	const [editingTarget, setEditingTarget] = useState<string>();
	const [previewBounds, setPreviewBounds] = useState<SceneRect>();
	const [isDragging, setIsDragging] = useState(false);
	const shellRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<DragState | undefined>(undefined);
	useEffect(() => {
		setDraft(structuredClone(slide));
		setSelectedObject(undefined);
		setEditingTarget(undefined);
		setPreviewBounds(undefined);
		setIsDragging(false);
	}, [slide.id]);

	useEffect(() => {
		if (!editingTarget) return;
		shellRef.current
			?.querySelector<HTMLElement>(".ss-scene-text-editor, .ss-scene-widget-editor input")
			?.focus();
		const closeOnOutsidePointer = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node) || shellRef.current?.contains(target)) return;
			setEditingTarget(undefined);
		};
		document.addEventListener("pointerdown", closeOnOutsidePointer, true);
		return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
	}, [editingTarget]);

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
			const delta = { x: pointer.x - drag.startPointer.x, y: pointer.y - drag.startPointer.y };
			const nextBounds =
				drag.interaction === "move"
					? moveBounds(drag.startBounds, delta)
					: resizeBounds(drag.startBounds, delta, drag.interaction);
			drag.didMove ||= Object.keys(nextBounds).some(
				(key) => nextBounds[key as keyof SceneRect] !== drag.startBounds[key as keyof SceneRect],
			);
			setPreviewBounds(nextBounds);
		};
		const end = (event: PointerEvent) => {
			const drag = dragRef.current;
			if (!drag || event.pointerId !== drag.pointerId) return;
			dragRef.current = undefined;
			setIsDragging(false);
			setPreviewBounds((preview) => {
				if (!preview || !drag.didMove) return preview;
				setDraft((current) => {
					let next = current;
					const parent = drag.parent as ResolvedSceneGroup;
					if (parent.layout === "stack" || parent.layout === "grid") {
						next = applySceneCommand(next, {
							type: "materialize-group",
							nodeId: parent.id,
							childBounds: parent.children.map((child) => ({
								nodeId: child.id,
								bounds: localBounds(child, parent),
							})),
						});
					}
					const origin = parentContentOrigin(parent);
					const updated = applySceneCommand(next, {
						type: "set-bounds",
						nodeId: drag.node.id,
						bounds: {
							x: preview.x - origin.x,
							y: preview.y - origin.y,
							width: preview.width,
							height: preview.height,
						},
					});
					onChange(updated);
					return updated;
				});
				const parent = drag.parent as ResolvedSceneGroup;
				setSelectedObject({
					node: { ...drag.node, bounds: preview },
					parent:
						parent.layout === "stack" || parent.layout === "grid"
							? ({ ...parent, layout: "absolute" } as ResolvedSceneNode)
							: parent,
				});
				return preview;
			});
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

	const beginDrag = (
		event: ReactPointerEvent<HTMLElement>,
		node: ResolvedSceneNode,
		parent: ResolvedSceneNode,
		interaction: DragState["interaction"] = "move",
	) => {
		if (editingTarget) return;
		const shell = shellRef.current;
		if (!shell) return;
		const rect = shell.getBoundingClientRect();
		if (!rect.width || !rect.height) return;
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture?.(event.pointerId);
		const startBounds = alignedBounds(node.bounds);
		setPreviewBounds(startBounds);
		setIsDragging(true);
		dragRef.current = {
			node,
			parent,
			interaction,
			pointerId: event.pointerId,
			startBounds,
			didMove: false,
			startPointer: {
				x: ((event.clientX - rect.left) * SLIDE_WIDTH) / rect.width,
				y: ((event.clientY - rect.top) * SLIDE_HEIGHT) / rect.height,
			},
		};
	};

	const selectObject = (node: ResolvedSceneNode, parent: ResolvedSceneNode) => {
		setSelectedObject({ node, parent });
		setPreviewBounds(node.bounds);
	};

	return (
		<div
			ref={shellRef}
			className="ss-edit-shell ss-scene-edit-shell"
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) {
					setSelectedObject(undefined);
					setEditingTarget(undefined);
					setPreviewBounds(undefined);
				}
			}}
		>
			<SceneRenderer
				slide={draft}
				currentTemplate={currentTemplate}
				isActive
				editingTarget={editingTarget}
				onSelectText={(nodeId) => {
					if (selectedObject?.node.id === nodeId) setEditingTarget(nodeId);
				}}
				onSelectWidget={(nodeId) => {
					if (selectedObject?.node.id === nodeId) setEditingTarget(nodeId);
				}}
				onSelectObject={selectObject}
				onEditText={(nodeId, text) => {
					setDraft((current) => {
						const updated = applySceneCommand(current, { type: "set-text", nodeId, text });
						onChange(updated);
						return updated;
					});
				}}
				onEditWidget={(nodeId, props) => {
					setDraft((current) => {
						const updated = applySceneCommand(current, {
							type: "set-widget-props",
							nodeId,
							props,
						});
						onChange(updated);
						return updated;
					});
				}}
			/>
			{isDragging && <div aria-hidden="true" className="ss-scene-grid" />}
			{selectedObject && previewBounds && (
				<div
					aria-hidden="true"
					className="ss-scene-selection"
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
								data-scene-snap-corner={corner}
								className={`ss-scene-snap-corner ss-scene-snap-corner--${corner}`}
							/>
						))}
					{["top", "right", "bottom", "left"].map((edge) => (
						<div
							key={edge}
							data-scene-selection-border={edge}
							className={`ss-scene-selection-border ss-scene-selection-border--${edge}`}
							onPointerDown={(event) =>
								beginDrag(event, selectedObject.node, selectedObject.parent)
							}
						/>
					))}
					{["top-left", "top-right", "bottom-right", "bottom-left"].map((corner) => (
						<div
							key={corner}
							data-scene-resize-handle={corner}
							className={`ss-scene-resize-handle ss-scene-resize-handle--${corner}`}
							onPointerDown={(event) =>
								beginDrag(
									event,
									selectedObject.node,
									selectedObject.parent,
									corner as Exclude<DragState["interaction"], "move">,
								)
							}
						/>
					))}
				</div>
			)}
		</div>
	);
}
