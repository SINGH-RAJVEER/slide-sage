import { BINARY_PPTX_TEMPLATE_CATALOG, type PresentationTemplateReference } from "@slidesage/types";
import { Badge } from "@slidesage/ui/components/badge";
import { Button } from "@slidesage/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@slidesage/ui/components/dropdown-menu";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import type React from "react";
import { templateIsSelectable } from "../../lib/template-selection";
import { MarqueeText } from "./MarqueeText";

export interface InstalledTemplateOption {
	marketplaceId: string;
	name: string;
	description: string;
	templateReference: PresentationTemplateReference;
	thumbnailPath: string;
}

interface TemplateSelectorProps {
	selectedTemplate: PresentationTemplateReference;
	onTemplateChange: (template: PresentationTemplateReference) => void;
	className?: string;
	installedThemes?: InstalledTemplateOption[];
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({
	selectedTemplate,
	onTemplateChange,
	className = "",
	installedThemes = [],
}) => {
	const defaultTemplates = BINARY_PPTX_TEMPLATE_CATALOG.filter(
		(template) => template.availability === "default",
	);
	const currentTemplate = BINARY_PPTX_TEMPLATE_CATALOG.find(
		(template) =>
			template.id === selectedTemplate.id && template.version === selectedTemplate.version,
	);

	return (
		<div className={`flex items-center ${className}`}>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						className="flex h-12 select-none items-center gap-3 rounded-lg px-5 text-base font-light text-white/70 transition-all outline-none hover:bg-white/5 hover:text-white focus-visible:bg-white/5 focus-visible:text-white focus-visible:ring-0 focus-visible:outline-none"
					>
						<span className="opacity-50">Template</span>
						<MarqueeText className="max-w-40 text-white" text={currentTemplate?.name || "Select"} />
						<ChevronDown className="h-4 w-4 opacity-50" />
					</Button>
				</DropdownMenuTrigger>

				<DropdownMenuContent
					className="w-72 bg-gray-900/95 backdrop-blur-xl border-white/10 p-1 shadow-2xl rounded-xl"
					align="start"
				>
					<DropdownMenuLabel className="text-white/40 text-xs font-medium uppercase tracking-wider flex items-center gap-2 px-2 py-2">
						<Sparkles className="w-3 h-3" />
						Choose template
					</DropdownMenuLabel>
					<DropdownMenuSeparator className="bg-white/5 mx-2" />

					{defaultTemplates.map((template) => {
						const isSelected = selectedTemplate.id === template.id;
						const selectable = templateIsSelectable(template);

						return (
							<DropdownMenuItem
								key={template.id}
								disabled={!selectable}
								onClick={() => {
									if (!selectable) return;
									onTemplateChange({ id: template.id, version: template.version });
								}}
								className={`
                  text-white/80 hover:bg-white/5 focus:bg-white/5 cursor-pointer p-3 rounded-lg my-1 mx-1
                  ${isSelected ? "bg-white/5" : ""}
                `}
							>
								<div className="flex items-center gap-3 w-full">
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
											{selectable ? "PowerPoint template" : "Preparing for export"}
										</div>
									</div>

									{/* Check mark */}
									{isSelected && <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />}
								</div>
							</DropdownMenuItem>
						);
					})}
					{installedThemes.length > 0 && (
						<>
							<DropdownMenuSeparator className="bg-white/5 mx-2" />
							<DropdownMenuLabel className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-amber-200/45">
								From Marketplace
							</DropdownMenuLabel>
							{installedThemes.map((theme) => {
								const isSelected = selectedTemplate.id === theme.templateReference.id;
								const selectable = templateIsSelectable(theme.templateReference);
								return (
									<DropdownMenuItem
										key={theme.marketplaceId}
										disabled={!selectable}
										onClick={() => {
											if (!selectable) return;
											onTemplateChange({ ...theme.templateReference });
										}}
										className="mx-1 my-1 cursor-pointer rounded-lg p-3 text-white/80 hover:bg-white/5 focus:bg-white/5"
									>
										<div className="flex w-full items-center gap-3">
											<div className="min-w-0 flex-1">
												<div className="truncate text-sm font-medium text-white/80">
													{theme.name}
												</div>
												<div className="mt-1 truncate text-xs text-white/40">
													{selectable ? theme.description : "Preparing for export"}
												</div>
											</div>
											{isSelected && <Check className="w-4 h-4 shrink-0 text-blue-400" />}
										</div>
									</DropdownMenuItem>
								);
							})}
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
};

export default TemplateSelector;
