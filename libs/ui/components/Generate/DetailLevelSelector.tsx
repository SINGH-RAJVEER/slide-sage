import { Button } from "@slidesage/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@slidesage/ui/components/dropdown-menu";
import { ChevronDown } from "lucide-react";
import type React from "react";

interface DetailLevelSelectorProps {
	detailLevel: string;
	onDetailLevelChange: (level: string) => void;
}

export const DetailLevelSelector: React.FC<DetailLevelSelectorProps> = ({
	detailLevel,
	onDetailLevelChange,
}) => {
	return (
		<div className="flex items-center">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						className="h-12 px-5 text-white/70 hover:text-white hover:bg-white/5 transition-all text-base font-light flex gap-3 items-center rounded-lg"
					>
						<span className="opacity-50">Detail:</span>
						<span className="text-white">
							{detailLevel.charAt(0).toUpperCase() + detailLevel.slice(1)}
						</span>
						<ChevronDown className="h-4 w-4 opacity-50" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="min-w-36 border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl text-white rounded-xl">
					<DropdownMenuItem
						onClick={() => onDetailLevelChange("brief")}
						className="text-white/80 focus:text-white focus:bg-white/10 cursor-pointer rounded-lg my-1"
					>
						Brief
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => onDetailLevelChange("concise")}
						className="text-white/80 focus:text-white focus:bg-white/10 cursor-pointer rounded-lg my-1"
					>
						Concise
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => onDetailLevelChange("balanced")}
						className="text-white/80 focus:text-white focus:bg-white/10 cursor-pointer rounded-lg my-1"
					>
						Balanced
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => onDetailLevelChange("detailed")}
						className="text-white/80 focus:text-white focus:bg-white/10 cursor-pointer rounded-lg my-1"
					>
						Detailed
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => onDetailLevelChange("comprehensive")}
						className="text-white/80 focus:text-white focus:bg-white/10 cursor-pointer rounded-lg my-1"
					>
						Comprehensive
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
};
