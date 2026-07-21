import { Check, ChevronDown, LayoutTemplate } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PresentationLayoutPreference } from "@/modules/types/presentation";

const LAYOUT_OPTIONS: Array<{
    id: PresentationLayoutPreference;
    label: string;
    description: string;
}> = [
    { id: "auto", label: "Auto mix", description: "Match each slide to its content" },
    { id: "content", label: "Content focused", description: "Clear narrative and bullet layouts" },
    { id: "two-column", label: "Two-column", description: "Comparisons and paired ideas" },
    { id: "image-led", label: "Image-led", description: "Visual slots beside concise copy" },
    { id: "data-led", label: "Data-led", description: "Charts, tables, stats, and callouts" },
];

interface LayoutPreferenceSelectorProps {
    layoutPreference: PresentationLayoutPreference;
    onLayoutPreferenceChange: (preference: PresentationLayoutPreference) => void;
}

export const LayoutPreferenceSelector: React.FC<LayoutPreferenceSelectorProps> = ({
    layoutPreference,
    onLayoutPreferenceChange,
}) => {
    const selected =
        LAYOUT_OPTIONS.find((option) => option.id === layoutPreference) || LAYOUT_OPTIONS[0];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    className="h-12 gap-3 rounded-lg px-5 text-base font-light text-white/70 transition-all hover:bg-white/5 hover:text-white"
                >
                    <LayoutTemplate className="h-4 w-4 opacity-50" />
                    <span className="opacity-50">Layout:</span>
                    <span className="text-white">{selected?.label}</span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                className="min-w-64 rounded-xl border border-white/10 bg-black/40 p-1 text-white shadow-2xl backdrop-blur-xl"
            >
                {LAYOUT_OPTIONS.map((option) => (
                    <DropdownMenuItem
                        key={option.id}
                        onClick={() => onLayoutPreferenceChange(option.id)}
                        className={`my-1 cursor-pointer rounded-lg px-3 py-2.5 text-white/80 focus:bg-white/10 focus:text-white ${
                            option.id === layoutPreference ? "bg-white/5" : ""
                        }`}
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{option.label}</span>
                            <span className="block text-xs text-white/40">
                                {option.description}
                            </span>
                        </span>
                        {option.id === layoutPreference && (
                            <Check className="h-4 w-4 shrink-0 text-blue-300" />
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
