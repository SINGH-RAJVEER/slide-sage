import { Check, ChevronDown, Sparkles } from "lucide-react";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AVAILABLE_TEMPLATES } from "@/modules/types/template";

interface TemplateSelectorProps {
    selectedTemplate: string;
    onTemplateChange: (templateId: string) => void;
    className?: string;
}

const getTemplatePreviewColors = (templateId: string) => {
    const fallbackColors = {
        primary: "bg-white",
        secondary: "bg-blue-900",
        accent: "bg-blue-600",
    };
    const colorMap: Record<string, { primary: string; secondary: string; accent: string }> = {
        "modern-dark": {
            primary: "bg-slate-900",
            secondary: "bg-cyan-400",
            accent: "bg-indigo-500",
        },
        "corporate-blue": {
            primary: "bg-white",
            secondary: "bg-blue-900",
            accent: "bg-blue-600",
        },
        minimalist: {
            primary: "bg-stone-50",
            secondary: "bg-stone-900",
            accent: "bg-stone-400",
        },
        "creative-studio": {
            primary: "bg-orange-500",
            secondary: "bg-pink-500",
            accent: "bg-purple-600",
        },
        "nature-green": {
            primary: "bg-green-50",
            secondary: "bg-green-700",
            accent: "bg-emerald-500",
        },
        "elegant-serif": {
            primary: "bg-stone-100",
            secondary: "bg-stone-800",
            accent: "bg-stone-500",
        },
    };

    return colorMap[templateId] ?? fallbackColors;
};

const TemplateSelector: React.FC<TemplateSelectorProps> = ({
    selectedTemplate,
    onTemplateChange,
    className = "",
}) => {
    const currentTemplate = AVAILABLE_TEMPLATES.find((t) => t.id === selectedTemplate);

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        className="w-52 bg-black/20 border-white/5 text-white/80 hover:bg-white/5 hover:text-white justify-between backdrop-blur-sm transition-all duration-200"
                    >
                        <div className="flex items-center gap-2">
                            {/* Current template preview */}
                            {currentTemplate && (
                                <div className="flex gap-1">
                                    {Object.values(
                                        getTemplatePreviewColors(currentTemplate.id),
                                    ).map((color) => (
                                        <div
                                            key={`${currentTemplate.id}-${color}`}
                                            className={`w-2 h-2 rounded-full ${color}`}
                                        />
                                    ))}
                                </div>
                            )}
                            <span className="truncate">
                                {currentTemplate?.name || "Select Template"}
                            </span>
                        </div>
                        <ChevronDown className="w-4 h-4 opacity-30 group-hover:opacity-50" />
                    </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                    className="w-72 bg-gray-900/95 backdrop-blur-xl border-white/10 p-1 shadow-2xl rounded-xl"
                    align="start"
                >
                    <DropdownMenuLabel className="text-white/40 text-xs font-medium uppercase tracking-wider flex items-center gap-2 px-2 py-2">
                        <Sparkles className="w-3 h-3" />
                        Choose Template
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-white/5 mx-2" />

                    {AVAILABLE_TEMPLATES.map((template) => {
                        const colors = getTemplatePreviewColors(template.id);
                        const isSelected = selectedTemplate === template.id;

                        return (
                            <DropdownMenuItem
                                key={template.id}
                                onClick={() => onTemplateChange(template.id)}
                                className={`
                  text-white/80 hover:bg-white/5 focus:bg-white/5 cursor-pointer p-3 rounded-lg my-1 mx-1
                  ${isSelected ? "bg-white/5" : ""}
                `}
                            >
                                <div className="flex items-center gap-3 w-full">
                                    {/* Template preview */}
                                    <div className="flex-shrink-0">
                                        <div className="w-8 h-6 rounded border border-white/10 overflow-hidden flex shadow-sm">
                                            <div className={`w-1/3 ${colors.primary}`} />
                                            <div className={`w-1/3 ${colors.secondary}`} />
                                            <div className={`w-1/3 ${colors.accent}`} />
                                        </div>
                                    </div>

                                    {/* Template info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`text-sm font-medium truncate ${isSelected ? "text-white" : "text-white/70"}`}
                                            >
                                                {template.name}
                                            </span>
                                            {isSelected && (
                                                <Badge
                                                    variant="secondary"
                                                    className="bg-blue-500/20 text-blue-300 text-[10px] px-1 h-5 flex items-center border border-blue-500/20"
                                                >
                                                    Active
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="text-xs text-white/40 mt-1 truncate">
                                            {template.description}
                                        </div>
                                    </div>

                                    {/* Check mark */}
                                    {isSelected && (
                                        <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                    )}
                                </div>
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};

export default TemplateSelector;
