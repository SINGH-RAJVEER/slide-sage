import type React from "react";
import { getSemanticTheme } from "../../lib/semantic-themes";

interface TemplateApplierProps {
	templateId: string;
	children: React.ReactNode;
	className?: string;
}

const TemplateApplier: React.FC<TemplateApplierProps> = ({
	templateId,
	children,
	className = "",
}) => {
	const template = getSemanticTheme(templateId);
	const styles = template.styles.slideContent;
	const { visual } = template;
	const themeVariables = {
		"--ss-accent": visual.accent,
		"--ss-accent-alt": visual.accentAlt,
		"--ss-chart-grid": visual.chartGrid,
		"--ss-foreground": visual.foreground,
		"--ss-line": visual.line,
		"--ss-muted": visual.muted,
		"--ss-surface": visual.surface,
		"--ss-title": visual.title,
		"--ss-display-font": visual.displayFont,
		"--ss-body-font": visual.bodyFont,
	} as React.CSSProperties;

	return (
		<div
			data-pdf-slide
			data-theme={template.id}
			data-theme-layout={visual.layout}
			className={`template-applier w-full h-full ${template.backgroundClass || ""} ${className}`}
			style={{
				...styles,
				...themeVariables,
				width: "100%",
				height: "100%",
				boxSizing: "border-box",
			}}
		>
			{children}
		</div>
	);
};

export default TemplateApplier;
