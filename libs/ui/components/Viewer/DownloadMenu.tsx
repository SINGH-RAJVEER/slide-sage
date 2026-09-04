import type { PresentationData } from "@slidesage/types";
import { Button } from "@slidesage/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@slidesage/ui/components/dropdown-menu";
import { ThinkingOrb } from "@slidesage/ui/components/thinking-orb";
import { ChevronDown, Download, Presentation } from "lucide-react";
import type React from "react";
import { useRef, useState } from "react";

interface Props {
	presentation: PresentationData;
	onExport?: PresentationExporter;
}

export type ExportFormat = "pptx";
export type PresentationExporter = (
	format: ExportFormat,
	presentation: PresentationData,
) => Promise<void>;

const DownloadMenu: React.FC<Props> = ({ presentation, onExport }) => {
	const exportInProgress = useRef(false);
	const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
	const [error, setError] = useState<string | null>(null);

	const download = async (format: ExportFormat) => {
		if (exportInProgress.current) return;

		exportInProgress.current = true;
		setExportingFormat(format);
		setError(null);
		try {
			if (!onExport) throw new Error("No presentation exporter was provided.");
			await onExport(format, presentation);
		} catch (exportError) {
			console.error(`Failed to export ${format.toUpperCase()} presentation`, exportError);
			setError(`${format.toUpperCase()} export failed. Please try again.`);
		} finally {
			exportInProgress.current = false;
			setExportingFormat(null);
		}
	};

	const isExporting = exportingFormat !== null;
	// Download serves the bytes of the current revision, so it is available as
	// soon as one exists.
	const revision = presentation.currentRevision;

	return (
		<div className="relative flex flex-col items-start gap-1">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						disabled={isExporting || !revision}
						variant="outline"
						className="bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20 shadow-none transition-colors duration-200"
					>
						{isExporting ? (
							<ThinkingOrb size={20} className="mr-2" />
						) : (
							<Download className="w-4 h-4 mr-2" />
						)}
						{isExporting ? `Exporting ${exportingFormat.toUpperCase()}` : "Download"}
						{!isExporting && <ChevronDown className="w-4 h-4 ml-2 opacity-60" />}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					side="top"
					align="start"
					className="w-48 bg-gray-900/80 backdrop-blur-md border border-white/10 text-white shadow-xl"
				>
					<DropdownMenuItem
						disabled={isExporting || !revision}
						onSelect={() => void download("pptx")}
						className="focus:bg-white/10 focus:text-white cursor-pointer"
					>
						<Presentation />
						<span>PowerPoint</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{error && (
				<span
					role="alert"
					className="absolute top-full mt-1 text-xs text-red-400 whitespace-nowrap"
				>
					{error}
				</span>
			)}
		</div>
	);
};

export default DownloadMenu;
