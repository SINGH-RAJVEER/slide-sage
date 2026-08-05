import { Button } from "@slidesage/ui/components/button";
import { Columns2, Columns3, Columns4 } from "lucide-react";
import type React from "react";

interface GridSizeControlProps {
	gridSize: 2 | 3 | 4;
	onGridSizeChange: (size: 2 | 3 | 4) => void;
}

export const GridSizeControl: React.FC<GridSizeControlProps> = ({ gridSize, onGridSizeChange }) => {
	return (
		<div className="flex items-center gap-2">
			<span className="text-white/70 text-sm mr-2">Grid Size:</span>
			<Button
				variant="ghost"
				size="icon"
				onClick={() => onGridSizeChange(2)}
				className={`h-10 w-10 ${
					gridSize === 2
						? "bg-white/20 text-white"
						: "text-white/60 hover:text-white hover:bg-white/10"
				}`}
				title="2 columns"
			>
				<Columns2 className="h-5 w-5" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				onClick={() => onGridSizeChange(3)}
				className={`h-10 w-10 ${
					gridSize === 3
						? "bg-white/20 text-white"
						: "text-white/60 hover:text-white hover:bg-white/10"
				}`}
				title="3 columns"
			>
				<Columns3 className="h-5 w-5" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				onClick={() => onGridSizeChange(4)}
				className={`h-10 w-10 ${
					gridSize === 4
						? "bg-white/20 text-white"
						: "text-white/60 hover:text-white hover:bg-white/10"
				}`}
				title="4 columns"
			>
				<Columns4 className="h-5 w-5" />
			</Button>
		</div>
	);
};
