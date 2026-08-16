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
import { AVAILABLE_TEMPLATES, getTemplate } from "../../lib/templates";

export interface InstalledTemplateOption {
	marketplaceId: string;
	themeId: string;
	name: string;
	description: string;
}

interface TemplateSelectorProps {
	selectedTemplate: string;
	onTemplateChange: (templateId: string) => void;
	className?: string;
	installedThemes?: InstalledTemplateOption[];
}

const getTemplatePreviewColors = (templateId: string) => {
	const { visual } = getTemplate(templateId);
	return {
		primary: visual.background,
		secondary: visual.title,
		accent: visual.accent,
	};
};

const TemplateSelector: React.FC<TemplateSelectorProps> = ({
	selectedTemplate,
	onTemplateChange,
	className = "",
	installedThemes = [],
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
									{Object.values(getTemplatePreviewColors(currentTemplate.id)).map((color) => (
										<div
											key={`${currentTemplate.id}-${color}`}
											className="h-2 w-2 rounded-full"
											style={{ backgroundColor: color }}
										/>
									))}
								</div>
							)}
							<span className="truncate">{currentTemplate?.name || "Select Theme"}</span>
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
						Choose Theme
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
											<div className="w-1/3" style={{ backgroundColor: colors.primary }} />
											<div className="w-1/3" style={{ backgroundColor: colors.secondary }} />
											<div className="w-1/3" style={{ backgroundColor: colors.accent }} />
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
								const colors = getTemplatePreviewColors(theme.themeId);
								return (
									<DropdownMenuItem
										key={theme.marketplaceId}
										onClick={() => onTemplateChange(theme.themeId)}
										className="mx-1 my-1 cursor-pointer rounded-lg p-3 text-white/80 hover:bg-white/5 focus:bg-white/5"
									>
										<div className="flex w-full items-center gap-3">
											<div className="flex h-6 w-8 shrink-0 overflow-hidden rounded border border-white/10 shadow-sm">
												<div className="w-1/3" style={{ backgroundColor: colors.primary }} />
												<div className="w-1/3" style={{ backgroundColor: colors.secondary }} />
												<div className="w-1/3" style={{ backgroundColor: colors.accent }} />
											</div>
											<div className="min-w-0 flex-1">
												<div className="truncate text-sm font-medium text-white/80">
													{theme.name}
												</div>
												<div className="mt-1 truncate text-xs text-white/40">
													{theme.description}
												</div>
											</div>
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
