import { Button } from "@slidesage/ui/components/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@slidesage/ui/components/dropdown-menu";
import { ChevronDown } from "lucide-react";
import type React from "react";

interface TonalitySelectorProps {
    tonality: string;
    onTonalityChange: (tonality: string) => void;
}

export const TonalitySelector: React.FC<TonalitySelectorProps> = ({
    tonality,
    onTonalityChange,
}) => {
    return (
        <div className="flex items-center">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className="h-12 px-5 text-white/70 hover:text-white hover:bg-white/5 transition-all text-base font-light flex gap-3 items-center rounded-lg"
                    >
                        <span className="opacity-50">Tonality:</span>
                        <span className="text-white">
                            {tonality.charAt(0).toUpperCase() + tonality.slice(1)}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-36 border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl text-white rounded-xl">
                    <DropdownMenuItem
                        onClick={() => onTonalityChange("professional")}
                        className="text-white/80 focus:text-white focus:bg-white/10 cursor-pointer rounded-lg my-1"
                    >
                        Professional
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => onTonalityChange("casual")}
                        className="text-white/80 focus:text-white focus:bg-white/10 cursor-pointer rounded-lg my-1"
                    >
                        Casual
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => onTonalityChange("enthusiastic")}
                        className="text-white/80 focus:text-white focus:bg-white/10 cursor-pointer rounded-lg my-1"
                    >
                        Enthusiastic
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => onTonalityChange("persuasive")}
                        className="text-white/80 focus:text-white focus:bg-white/10 cursor-pointer rounded-lg my-1"
                    >
                        Persuasive
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};
