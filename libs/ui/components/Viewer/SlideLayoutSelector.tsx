import type { SlideLayout } from "@slide-sage/types";
import { Badge } from "@slide-sage/ui/components/badge";
import { Button } from "@slide-sage/ui/components/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@slide-sage/ui/components/dropdown-menu";
import {
    AlignLeft,
    Check,
    ChevronDown,
    Columns2,
    GalleryHorizontalEnd,
    Grid3X3,
    Image,
    LayoutTemplate,
    PanelLeft,
    Quote,
    Rows3,
    Scan,
    Type,
} from "lucide-react";
import type React from "react";

const LAYOUTS: Array<{
    id: SlideLayout;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
}> = [
    {
        id: "cover",
        label: "Cover",
        description: "Opening statement with a quiet footer",
        icon: Type,
    },
    { id: "section", label: "Section", description: "Editorial chapter divider", icon: Rows3 },
    { id: "body", label: "Body", description: "Asymmetric narrative flow", icon: AlignLeft },
    {
        id: "split",
        label: "Split",
        description: "Weighted side-by-side ideas",
        icon: Columns2,
    },
    {
        id: "comparison",
        label: "Comparison",
        description: "Surfaced paired panels",
        icon: GalleryHorizontalEnd,
    },
    {
        id: "sidebar",
        label: "Sidebar",
        description: "Main story with a 68/32 rail",
        icon: PanelLeft,
    },
    {
        id: "media-left",
        label: "Media left",
        description: "Full-height visual on the left",
        icon: Image,
    },
    {
        id: "media-right",
        label: "Media right",
        description: "Full-height visual on the right",
        icon: Image,
    },
    { id: "quote", label: "Quote", description: "Focused quotation", icon: Quote },
    {
        id: "spotlight",
        label: "Spotlight",
        description: "Hero block with a support strip",
        icon: Scan,
    },
    {
        id: "canvas",
        label: "Canvas",
        description: "Varied masonry-like composition",
        icon: Grid3X3,
    },
];

interface SlideLayoutSelectorProps {
    selectedLayout?: SlideLayout;
    onLayoutChange: (layout: SlideLayout) => void;
    disabled?: boolean;
}

export const SlideLayoutSelector: React.FC<SlideLayoutSelectorProps> = ({
    selectedLayout,
    onLayoutChange,
    disabled = false,
}) => {
    const current = LAYOUTS.find((layout) => layout.id === selectedLayout);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={disabled}>
                <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    className="w-44 justify-between border-white/5 bg-black/20 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/5 hover:text-white disabled:opacity-45"
                >
                    <span className="flex min-w-0 items-center gap-2">
                        <LayoutTemplate className="h-4 w-4 shrink-0 text-white/45" />
                        <span className="truncate">
                            {disabled ? "Chart layout" : current?.label}
                        </span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-40" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                className="max-h-[32rem] w-72 overflow-y-auto rounded-xl border border-white/10 bg-gray-900/95 p-1 text-white shadow-2xl backdrop-blur-xl"
            >
                <DropdownMenuLabel className="flex items-center gap-2 px-2 py-2 text-xs font-medium text-white/40">
                    <LayoutTemplate className="h-3 w-3" />
                    Choose Layout
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="mx-2 bg-white/5" />

                {LAYOUTS.map((layout) => {
                    const isSelected = layout.id === selectedLayout;
                    const Icon = layout.icon;

                    return (
                        <DropdownMenuItem
                            key={layout.id}
                            aria-label={layout.label}
                            onClick={() => onLayoutChange(layout.id)}
                            className={`mx-1 my-1 cursor-pointer rounded-lg p-3 text-white/80 focus:bg-white/5 focus:text-white ${
                                isSelected ? "bg-white/5" : ""
                            }`}
                        >
                            <Icon className="h-4 w-4 shrink-0 text-white/40" />
                            <span className="min-w-0 flex-1">
                                <span
                                    className={`block truncate text-sm font-medium ${
                                        isSelected ? "text-white" : "text-white/70"
                                    }`}
                                >
                                    {layout.label}
                                </span>
                                <span className="mt-1 block truncate text-xs text-white/40">
                                    {layout.description}
                                </span>
                            </span>
                            {isSelected && (
                                <>
                                    <Badge
                                        variant="secondary"
                                        className="flex h-5 items-center border border-blue-500/20 bg-blue-500/20 px-1 text-[10px] text-blue-300"
                                    >
                                        Active
                                    </Badge>
                                    <Check className="h-4 w-4 shrink-0 text-blue-400" />
                                </>
                            )}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
