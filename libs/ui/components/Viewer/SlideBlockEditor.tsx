import type { BlockEmphasis, BlockTreatment, SlideLayout, SlideRegion } from "@slide-sage/types";
import { Button } from "@slide-sage/ui/components/button";
import { ArrowDown, ArrowUp, Copy, Trash2 } from "lucide-react";
import type { EditableSlideBlock } from "../../lib/slide-block-editing";

interface SlideBlockEditorProps {
    block: EditableSlideBlock;
    layout: SlideLayout;
    index: number;
    count: number;
    onChange: (block: EditableSlideBlock) => void;
    onMove: (offset: -1 | 1) => void;
    onDuplicate: () => void;
    onDelete: () => void;
}

const fieldClass =
    "w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-blue-400";

export function SlideBlockEditor({
    block,
    layout,
    index,
    count,
    onChange,
    onMove,
    onDuplicate,
    onDelete,
}: SlideBlockEditorProps) {
    const updateRegion = (region: SlideRegion) => onChange({ ...block, region });
    const supportsRegions = [
        "split",
        "comparison",
        "sidebar",
        "media-left",
        "media-right",
        "spotlight",
    ].includes(layout);
    const regionOptions: Array<{ value: SlideRegion; label: string }> =
        layout === "media-left" || layout === "media-right"
            ? [
                  { value: "primary", label: "Primary content" },
                  { value: "secondary", label: "Supporting content" },
                  { value: "media", label: "Media" },
              ]
            : [
                  { value: "primary", label: layout === "sidebar" ? "Main (68%)" : "Primary" },
                  {
                      value: "secondary",
                      label: layout === "sidebar" ? "Sidebar (32%)" : "Secondary",
                  },
              ];
    return (
        <section className="grid gap-4" aria-label={`${block.type} block editor`}>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-white/40">
                        Block {index + 1}
                    </p>
                    <h3 className="mt-1 text-base font-medium capitalize text-white">
                        {block.type.replace("-", " ")}
                    </h3>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={index === 0}
                        onClick={() => onMove(-1)}
                        aria-label="Move block up"
                    >
                        <ArrowUp className="size-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={index === count - 1}
                        onClick={() => onMove(1)}
                        aria-label="Move block down"
                    >
                        <ArrowDown className="size-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onDuplicate}
                        aria-label="Duplicate block"
                    >
                        <Copy className="size-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onDelete}
                        aria-label="Delete block"
                        className="text-red-300 hover:text-red-200"
                    >
                        <Trash2 className="size-4" />
                    </Button>
                </div>
            </div>

            {supportsRegions && (
                <label className="grid gap-2 text-sm text-white/70">
                    Region
                    <select
                        className={fieldClass}
                        value={block.region}
                        onChange={(event) => updateRegion(event.target.value as SlideRegion)}
                    >
                        {regionOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2 text-sm text-white/70">
                    Emphasis
                    <select
                        className={fieldClass}
                        value={block.emphasis || "standard"}
                        onChange={(event) =>
                            onChange({
                                ...block,
                                emphasis: event.target.value as BlockEmphasis,
                            })
                        }
                    >
                        <option value="standard">Standard</option>
                        <option value="strong">Strong</option>
                        <option value="hero">Hero</option>
                        <option value="supporting">Supporting</option>
                    </select>
                </label>
                <label className="grid gap-2 text-sm text-white/70">
                    Treatment
                    <select
                        className={fieldClass}
                        value={block.treatment || "plain"}
                        onChange={(event) =>
                            onChange({
                                ...block,
                                treatment: event.target.value as BlockTreatment,
                            })
                        }
                    >
                        <option value="plain">Plain</option>
                        <option value="card">Card</option>
                        <option value="outline">Outline</option>
                        <option value="accent">Accent</option>
                    </select>
                </label>
            </div>

            {block.type === "paragraph" && (
                <textarea
                    className={fieldClass}
                    rows={8}
                    value={block.text}
                    onChange={(event) => onChange({ ...block, text: event.target.value })}
                    maxLength={1200}
                />
            )}
            {block.type === "bullets" && (
                <>
                    <textarea
                        className={fieldClass}
                        rows={8}
                        value={block.items.join("\n")}
                        onChange={(event) =>
                            onChange({
                                ...block,
                                items: event.target.value.split("\n").slice(0, 8),
                            })
                        }
                    />
                    <label className="flex items-center gap-2 text-sm text-white/70">
                        <input
                            type="checkbox"
                            checked={block.ordered}
                            onChange={(event) =>
                                onChange({ ...block, ordered: event.target.checked })
                            }
                        />{" "}
                        Numbered list
                    </label>
                </>
            )}
            {block.type === "quote" && (
                <>
                    <textarea
                        className={fieldClass}
                        rows={6}
                        value={block.text}
                        onChange={(event) => onChange({ ...block, text: event.target.value })}
                        maxLength={900}
                    />
                    <input
                        className={fieldClass}
                        value={block.attribution}
                        onChange={(event) =>
                            onChange({ ...block, attribution: event.target.value })
                        }
                        placeholder="Attribution"
                        maxLength={240}
                    />
                </>
            )}
            {block.type === "callout" && (
                <>
                    <input
                        className={fieldClass}
                        value={block.heading}
                        onChange={(event) => onChange({ ...block, heading: event.target.value })}
                        placeholder="Heading"
                        maxLength={240}
                    />
                    <textarea
                        className={fieldClass}
                        rows={6}
                        value={block.text}
                        onChange={(event) => onChange({ ...block, text: event.target.value })}
                        maxLength={900}
                    />
                </>
            )}
            {block.type === "image" && (
                <>
                    <input
                        className={fieldClass}
                        value={block.url}
                        onChange={(event) => onChange({ ...block, url: event.target.value })}
                        placeholder="https://example.com/image.jpg"
                    />
                    <input
                        className={fieldClass}
                        value={block.alt}
                        onChange={(event) => onChange({ ...block, alt: event.target.value })}
                        placeholder="Image description"
                        maxLength={300}
                    />
                    <input
                        className={fieldClass}
                        value={block.caption}
                        onChange={(event) => onChange({ ...block, caption: event.target.value })}
                        placeholder="Caption"
                        maxLength={300}
                    />
                </>
            )}
            {block.type === "image-placeholder" && (
                <>
                    <input
                        className={fieldClass}
                        value={block.alt}
                        onChange={(event) => onChange({ ...block, alt: event.target.value })}
                        placeholder="Visual description"
                        maxLength={300}
                    />
                    <input
                        className={fieldClass}
                        value={block.caption}
                        onChange={(event) => onChange({ ...block, caption: event.target.value })}
                        placeholder="Caption"
                        maxLength={300}
                    />
                </>
            )}
            {block.type === "stats" && (
                <div className="grid gap-2">
                    {block.items.map((item, itemIndex) => (
                        <div
                            className="grid grid-cols-[1fr_1.5fr_auto] gap-2"
                            key={`${block.id}-${item.value}-${item.label}`}
                        >
                            <input
                                className={fieldClass}
                                value={item.value}
                                onChange={(event) =>
                                    onChange({
                                        ...block,
                                        items: block.items.map((entry, i) =>
                                            i === itemIndex
                                                ? { ...entry, value: event.target.value }
                                                : entry,
                                        ),
                                    })
                                }
                                placeholder="Value"
                            />
                            <input
                                className={fieldClass}
                                value={item.label}
                                onChange={(event) =>
                                    onChange({
                                        ...block,
                                        items: block.items.map((entry, i) =>
                                            i === itemIndex
                                                ? { ...entry, label: event.target.value }
                                                : entry,
                                        ),
                                    })
                                }
                                placeholder="Label"
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                disabled={block.items.length === 1}
                                onClick={() =>
                                    onChange({
                                        ...block,
                                        items: block.items.filter((_, i) => i !== itemIndex),
                                    })
                                }
                                aria-label="Remove statistic"
                            >
                                <Trash2 className="size-4" />
                            </Button>
                        </div>
                    ))}
                    <Button
                        variant="outline"
                        onClick={() =>
                            onChange({
                                ...block,
                                items: [...block.items, { value: "0", label: "Metric" }].slice(
                                    0,
                                    6,
                                ),
                            })
                        }
                    >
                        Add statistic
                    </Button>
                </div>
            )}
            {block.type === "table" && (
                <div className="grid gap-3">
                    <label className="grid gap-2 text-sm text-white/70">
                        Headers
                        <input
                            className={fieldClass}
                            value={block.headers.join(" | ")}
                            onChange={(event) => {
                                const headers = event.target.value
                                    .split("|")
                                    .map((value) => value.trim())
                                    .slice(0, 6);
                                onChange({
                                    ...block,
                                    headers,
                                    rows: block.rows.map((row) =>
                                        headers.map((_, i) => row[i] || ""),
                                    ),
                                });
                            }}
                            placeholder="Column one | Column two"
                        />
                    </label>
                    <label className="grid gap-2 text-sm text-white/70">
                        Rows, one per line
                        <textarea
                            className={fieldClass}
                            rows={8}
                            value={block.rows.map((row) => row.join(" | ")).join("\n")}
                            onChange={(event) =>
                                onChange({
                                    ...block,
                                    rows: event.target.value
                                        .split("\n")
                                        .slice(0, 8)
                                        .map((row) =>
                                            block.headers.map(
                                                (_, i) => row.split("|")[i]?.trim() || "",
                                            ),
                                        ),
                                })
                            }
                            placeholder="Value one | Value two"
                        />
                    </label>
                </div>
            )}
        </section>
    );
}
