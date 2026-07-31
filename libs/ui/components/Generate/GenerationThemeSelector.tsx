import type { ThemeId } from "@slide-sage/types";
import { Button } from "@slide-sage/ui/components/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@slide-sage/ui/components/dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import type React from "react";

const THEMES: Array<{
    id: ThemeId;
    label: string;
    colors: [string, string, string];
}> = [
    { id: "corporate-blue", label: "Corporate Blue", colors: ["#eff6ff", "#1e40af", "#2563eb"] },
    { id: "modern-dark", label: "Modern Dark", colors: ["#0f172a", "#38bdf8", "#818cf8"] },
    { id: "minimalist", label: "Minimalist", colors: ["#fafaf9", "#1c1917", "#a8a29e"] },
    { id: "creative-studio", label: "Creative Studio", colors: ["#fff1f2", "#db2777", "#c084fc"] },
    { id: "elegant-serif", label: "Elegant Serif", colors: ["#f5f5f4", "#292524", "#78716c"] },
    { id: "nature-green", label: "Nature Green", colors: ["#f0fdf4", "#15803d", "#22c55e"] },
];
const DEFAULT_THEME = THEMES[0] as (typeof THEMES)[number];

export interface InstalledThemeOption {
    marketplaceId: string;
    themeId: ThemeId;
    name: string;
}

interface GenerationThemeSelectorProps {
    theme: ThemeId;
    onThemeChange: (theme: ThemeId) => void;
    installedThemes?: InstalledThemeOption[];
}

export const GenerationThemeSelector: React.FC<GenerationThemeSelectorProps> = ({
    theme,
    onThemeChange,
    installedThemes = [],
}) => {
    const installedOptions = installedThemes.map((item) => ({
        id: item.themeId,
        label: item.name,
        colors:
            THEMES.find((themeOption) => themeOption.id === item.themeId)?.colors ||
            DEFAULT_THEME.colors,
        marketplaceId: item.marketplaceId,
    }));
    const selected = THEMES.find((item) => item.id === theme) || DEFAULT_THEME;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    className="h-12 gap-3 rounded-lg px-5 text-base font-light text-white/70 transition-all hover:bg-white/5 hover:text-white"
                >
                    <span className="opacity-50">Theme:</span>
                    <span className="flex items-center gap-2 text-white">
                        <span className="flex gap-1" aria-hidden="true">
                            {selected?.colors.map((color) => (
                                <span
                                    key={color}
                                    className="h-2 w-2 rounded-full border border-white/15"
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </span>
                        {selected?.label}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                className="min-w-56 rounded-xl border border-white/10 bg-black/40 p-1 text-white shadow-2xl backdrop-blur-xl"
            >
                {THEMES.map((item) => (
                    <DropdownMenuItem
                        key={item.id}
                        onClick={() => onThemeChange(item.id)}
                        className={`my-1 cursor-pointer rounded-lg px-3 py-2.5 text-white/80 focus:bg-white/10 focus:text-white ${
                            item.id === theme ? "bg-white/5" : ""
                        }`}
                    >
                        <span className="flex flex-1 items-center gap-3">
                            <span
                                className="flex h-6 w-8 shrink-0 overflow-hidden rounded border border-white/10 shadow-sm"
                                aria-hidden="true"
                            >
                                {item.colors.map((color) => (
                                    <span
                                        key={color}
                                        className="h-full flex-1"
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </span>
                            {item.label}
                        </span>
                        {item.id === theme && <Check className="h-4 w-4 text-blue-300" />}
                    </DropdownMenuItem>
                ))}
                {installedOptions.map((item) => (
                    <DropdownMenuItem
                        key={item.marketplaceId}
                        onClick={() => onThemeChange(item.id)}
                        className="my-1 cursor-pointer rounded-lg px-3 py-2.5 text-white/80 focus:bg-white/10 focus:text-white"
                    >
                        <span className="flex flex-1 items-center gap-3">
                            <span
                                className="flex h-6 w-8 shrink-0 overflow-hidden rounded border border-white/10 shadow-sm"
                                aria-hidden="true"
                            >
                                {item.colors.map((color) => (
                                    <span
                                        key={color}
                                        className="h-full flex-1"
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </span>
                            <span className="flex-1">{item.label}</span>
                            <span className="text-[10px] uppercase tracking-wider text-amber-200/55">
                                Marketplace
                            </span>
                        </span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
