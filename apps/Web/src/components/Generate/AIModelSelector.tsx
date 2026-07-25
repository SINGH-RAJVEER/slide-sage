import type { AIConfigurationResponse, AIModelSelection } from "@slide-sage/types";
import { BrainCircuit } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface Props {
    config: AIConfigurationResponse;
    selection: AIModelSelection | null;
    onChange: (selection: AIModelSelection) => void;
}

const LABELS = { openai: "OpenAI", google: "Google Gemini", anthropic: "Anthropic" };

export function AIModelSelector({ config, selection, onChange }: Props) {
    if (!config.eligibility.eligible || config.models.length === 0) return null;
    const value = selection ? `${selection.provider}:${selection.model}` : undefined;
    return (
        <Select
            value={value}
            onValueChange={(next) => {
                const separator = next.indexOf(":");
                onChange({
                    provider: next.slice(0, separator) as AIModelSelection["provider"],
                    model: next.slice(separator + 1),
                });
            }}
        >
            <SelectTrigger className="h-10 w-52 shrink-0 border-white/10 bg-transparent text-white/80">
                <BrainCircuit className="size-4 text-white/45" />
                <SelectValue placeholder="Select AI model" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-gray-900 text-white">
                {(["openai", "google", "anthropic"] as const).map((provider) => {
                    const models = config.models.filter((model) => model.provider === provider);
                    if (models.length === 0) return null;
                    return (
                        <SelectGroup key={provider}>
                            <SelectLabel>{LABELS[provider]}</SelectLabel>
                            {models.map((model) => (
                                <SelectItem
                                    key={`${provider}:${model.model}`}
                                    value={`${provider}:${model.model}`}
                                >
                                    {model.label}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    );
                })}
            </SelectContent>
        </Select>
    );
}
