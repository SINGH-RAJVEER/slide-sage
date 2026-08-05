import type { WidgetBlock } from "@slidesage/types";
import React from "react";
import type { TemplateStyles } from "../../lib/templates";
import { compileWidgetScene, type WidgetWidth } from "../../lib/widget-scene";

const cssColor = (value: unknown, fallback: string) =>
	typeof value === "string" && (/^#|^rgb|^hsl/.test(value) || /^[a-z]+$/i.test(value))
		? value
		: fallback;

const nodeColors = (tone: string | undefined, accent: string, surface: string) => {
	if (tone === "positive") return { fill: "#dcfce7", line: "#16a34a" };
	if (tone === "danger") return { fill: "#fee2e2", line: "#dc2626" };
	if (tone === "warning") return { fill: "#fef3c7", line: "#d97706" };
	if (tone === "accent") return { fill: surface, line: accent };
	return { fill: surface, line: accent };
};

const keyedLines = (lines: string[]) => {
	const occurrences = new Map<string, number>();
	return lines.map((line) => {
		const occurrence = occurrences.get(line) || 0;
		occurrences.set(line, occurrence + 1);
		return { line, key: `${line}-${occurrence}` };
	});
};

export function WidgetRenderer({
	block,
	styles,
	widthMode,
}: {
	block: WidgetBlock;
	styles: TemplateStyles;
	widthMode: WidgetWidth;
}) {
	const scene = compileWidgetScene(block, widthMode);
	const markerId = React.useId().replaceAll(":", "");
	const textColor = cssColor(styles.slideContent.color, "#0f172a");
	const muted = cssColor(styles.slideDescription.color, textColor);
	const accent = cssColor(styles.slideTitle.color, "#2563eb");
	const surface = cssColor(styles.slideKeypoint.background, "#eff6ff");

	if (scene.warning) {
		return (
			<div
				role="img"
				aria-label={scene.label}
				style={{
					width: "100%",
					padding: "1.25rem",
					border: `1px dashed ${accent}`,
					color: muted,
					background: surface,
					textAlign: "center",
				}}
			>
				{scene.warning}
			</div>
		);
	}

	return (
		<svg
			role="img"
			aria-label={scene.label}
			viewBox={`0 0 ${scene.width} ${scene.height}`}
			preserveAspectRatio="xMidYMid meet"
			style={{ display: "block", width: "100%", maxHeight: "100%", overflow: "visible" }}
		>
			<title>{scene.label}</title>
			<desc>
				{`Generated ${scene.kind} diagram. ${scene.nodes
					.map(
						(node) =>
							`${node.role}: ${node.label}${node.description ? `, ${node.description}` : ""}`,
					)
					.join(". ")}`}
			</desc>
			<defs>
				<marker
					id={markerId}
					viewBox="0 0 10 10"
					refX="9"
					refY="5"
					markerWidth="7"
					markerHeight="7"
					orient="auto-start-reverse"
				>
					<path d="M 0 0 L 10 5 L 0 10 z" fill={accent} />
				</marker>
			</defs>
			<g>
				{scene.edges.map((edge) => (
					<g key={edge.key}>
						<polyline
							points={edge.points.map((point) => `${point.x},${point.y}`).join(" ")}
							fill="none"
							stroke={accent}
							strokeWidth="2.5"
							strokeLinecap="round"
							strokeLinejoin="round"
							markerEnd={`url(#${markerId})`}
						/>
						{edge.label && (
							<text x={edge.labelX} y={edge.labelY} fill={muted} fontSize="13" textAnchor="middle">
								{edge.label}
							</text>
						)}
					</g>
				))}
			</g>
			{scene.nodes.map((node, index) => {
				const colors = nodeColors(node.tone, accent, surface);
				const labelStart = node.y + (node.value ? 48 : 34);
				return (
					<g key={node.id} data-widget-node={node.id}>
						<rect
							x={node.x}
							y={node.y}
							width={node.width}
							height={node.height}
							rx="10"
							fill={colors.fill}
							stroke={colors.line}
							strokeWidth="2"
						/>
						<text
							x={node.x + 16}
							y={node.y + 20}
							fill={colors.line}
							fontSize="11"
							fontWeight="700"
							letterSpacing="1.2"
						>
							{node.role.toUpperCase()}
						</text>
						{node.value && (
							<text
								x={node.x + node.width - 16}
								y={node.y + 22}
								fill={textColor}
								fontSize="17"
								fontWeight="700"
								textAnchor="end"
							>
								{node.value}
							</text>
						)}
						<text x={node.x + 16} y={labelStart} fill={textColor} fontSize="16" fontWeight="700">
							{keyedLines(node.labelLines).map(({ line, key }, lineIndex) => (
								<tspan key={key} x={node.x + 16} dy={lineIndex ? 19 : 0}>
									{line}
								</tspan>
							))}
						</text>
						{node.descriptionLines.length > 0 && (
							<text
								x={node.x + 16}
								y={labelStart + node.labelLines.length * 19 + 6}
								fill={muted}
								fontSize="12"
							>
								{keyedLines(node.descriptionLines).map(({ line, key }, lineIndex) => (
									<tspan key={key} x={node.x + 16} dy={lineIndex ? 15 : 0}>
										{line}
									</tspan>
								))}
							</text>
						)}
						{scene.kind === "timeline" && (
							<circle cx={node.x + 9} cy={node.y + 9} r="4" fill={colors.line} />
						)}
						<title>{`${index + 1}. ${node.label}${node.description ? `. ${node.description}` : ""}`}</title>
					</g>
				);
			})}
		</svg>
	);
}
