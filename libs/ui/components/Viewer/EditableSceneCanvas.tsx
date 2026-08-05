import { applySceneCommand, type SceneSlide } from "@slidesage/types";
import { Button } from "@slidesage/ui/components/button";
import { Check, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SceneRenderer } from "./SceneRenderer";

interface EditableSceneCanvasProps {
	slide: SceneSlide;
	currentTemplate: string;
	saving: boolean;
	onSave: (slide: SceneSlide) => Promise<void>;
	onCancel: () => void;
}

export function EditableSceneCanvas({
	slide,
	currentTemplate,
	saving,
	onSave,
	onCancel,
}: EditableSceneCanvasProps) {
	const [draft, setDraft] = useState(() => structuredClone(slide));
	const [dirty, setDirty] = useState(false);
	const [editingTarget, setEditingTarget] = useState<string>();
	const shellRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setDraft(structuredClone(slide));
		setDirty(false);
		setEditingTarget(undefined);
	}, [slide]);

	useEffect(() => {
		if (!editingTarget) return;
		shellRef.current
			?.querySelector<HTMLElement>(".ss-scene-text-editor, .ss-scene-widget-editor input")
			?.focus();
		const closeOnOutsidePointer = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (
				target instanceof Element &&
				target.closest(".ss-scene-text-editor, .ss-scene-widget-editor")
			) {
				return;
			}
			setEditingTarget(undefined);
		};
		document.addEventListener("pointerdown", closeOnOutsidePointer, true);
		return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
	}, [editingTarget]);

	const revert = () => {
		setDraft(structuredClone(slide));
		setDirty(false);
		setEditingTarget(undefined);
		onCancel();
	};

	return (
		<div ref={shellRef} className="ss-edit-shell">
			<SceneRenderer
				slide={draft}
				currentTemplate={currentTemplate}
				isActive
				editingTarget={editingTarget}
				onSelectText={setEditingTarget}
				onSelectWidget={setEditingTarget}
				onEditText={(nodeId, text) => {
					setDirty(true);
					setDraft((current) => applySceneCommand(current, { type: "set-text", nodeId, text }));
				}}
				onEditWidget={(nodeId, props) => {
					setDirty(true);
					setDraft((current) =>
						applySceneCommand(current, { type: "set-widget-props", nodeId, props }),
					);
				}}
			/>
			{dirty && (
				<div className="ss-edit-toolbar ss-edit-toolbar--visible">
					<Button variant="ghost" size="sm" disabled={saving} onClick={revert}>
						<Undo2 className="mr-1 size-4" /> Revert
					</Button>
					<Button
						size="sm"
						disabled={saving}
						onClick={async () => {
							try {
								await onSave(draft);
							} catch {
								return;
							}
							setDirty(false);
							setEditingTarget(undefined);
						}}
					>
						<Check className="mr-1 size-4" /> {saving ? "Saving" : "Save"}
					</Button>
				</div>
			)}
		</div>
	);
}
