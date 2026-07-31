import type { ContentSlide, SlideBlock } from "@slide-sage/types";
import { Button } from "@slide-sage/ui/components/button";
import { Check, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SlideRenderer } from "./SlideRenderer";

interface EditableSlideCanvasProps {
    slide: ContentSlide;
    currentTemplate: string;
    saving: boolean;
    onSave: (slide: ContentSlide) => Promise<void>;
    onCancel: () => void;
}

export function EditableSlideCanvas({
    slide,
    currentTemplate,
    saving,
    onSave,
    onCancel,
}: EditableSlideCanvasProps) {
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
            setEditingTarget(undefined);
        };
        document.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
    }, [editingTarget]);

    const updateBlock = (block: SlideBlock) => {
        setDirty(true);
        setDraft((current) => ({
            ...current,
            blocks: current.blocks.map((item) => (item.id === block.id ? block : item)),
        }));
    };

    const revert = () => {
        setDraft(structuredClone(slide));
        setDirty(false);
        onCancel();
    };

    return (
        <div ref={shellRef} className="ss-edit-shell">
            <SlideRenderer
                slide={draft}
                currentTemplate={currentTemplate}
                isActive
                editingTarget={editingTarget}
                onSelectTitle={() => setEditingTarget("title")}
                onSelectSubtitle={() => setEditingTarget("subtitle")}
                onSelectBlock={(block) => block.id && setEditingTarget(block.id)}
                onEditTitle={(title) => {
                    setDirty(true);
                    setDraft((current) => ({ ...current, title }));
                }}
                onEditSubtitle={(subtitle) => {
                    setDirty(true);
                    setDraft((current) => ({ ...current, subtitle }));
                }}
                onEditBlock={updateBlock}
            />
            {dirty && (
                <div className="ss-edit-toolbar ss-edit-toolbar--visible">
                    <Button variant="ghost" size="sm" disabled={saving} onClick={revert}>
                        <Undo2 className="mr-1 size-4" /> Revert
                    </Button>
                    <Button
                        size="sm"
                        disabled={saving || !draft.title.trim()}
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
