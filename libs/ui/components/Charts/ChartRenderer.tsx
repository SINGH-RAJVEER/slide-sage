import type { ChartConfig } from "@slidesage/types";
import type { ChartOptions, Plugin } from "chart.js";
import {
	ArcElement,
	BarElement,
	CategoryScale,
	Chart,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	RadialLinearScale,
	Title,
	Tooltip,
} from "chart.js";
import type React from "react";
import { Bar, Doughnut, Line, Pie, PolarArea, Radar } from "react-chartjs-2";

// Register Chart.js components
Chart.register(
	CategoryScale,
	LinearScale,
	BarElement,
	LineElement,
	PointElement,
	ArcElement,
	RadialLinearScale,
	Title,
	Tooltip,
	Legend,
);

export type ChartDensity = "standard" | "compact";

/**
 * Draws every data point's value directly on the chart so numbers are readable
 * without hovering. Enabled by default; disable through
 * `options.plugins.ssValueLabels.display = false`.
 */
const ssValueLabels: Plugin = {
	id: "ssValueLabels",
	afterDatasetsDraw(chart, _args, opts) {
		const config = (opts || {}) as {
			display?: boolean;
			color?: string;
			fontFamily?: string;
			size?: number;
		};
		if (config.display === false) return;
		const chartKind = String((chart.config as { type?: unknown }).type);
		const ctx = chart.ctx;
		const size = config.size ?? 11;
		ctx.save();
		ctx.fillStyle = config.color ?? "#ffffff";
		ctx.font = `600 ${size}px ${config.fontFamily ?? "sans-serif"}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		for (let datasetIndex = 0; datasetIndex < chart.data.datasets.length; datasetIndex++) {
			const meta = chart.getDatasetMeta(datasetIndex);
			if (meta.hidden) continue;
			let previousX = Number.NaN;
			for (let index = 0; index < meta.data.length; index++) {
				const element = meta.data[index] as unknown as Record<string, unknown>;
				const raw = chart.data.datasets[datasetIndex]?.data?.[index];
				const value = typeof raw === "number" ? raw : Number(raw);
				if (!Number.isFinite(value)) continue;
				const text = formatChartValue(value);
				let x: number;
				let y: number;
				if (typeof element["innerRadius"] === "number") {
					// Arc slice (pie, doughnut, polarArea): label along the mid-angle.
					const mid = ((element["startAngle"] as number) + (element["endAngle"] as number)) / 2;
					const inner = element["innerRadius"] as number;
					const outer = element["outerRadius"] as number;
					const radius =
						chartConfigIsRing(chartKind) && inner > 0 ? (inner + outer) / 2 : outer * 0.74;
					x = (element["x"] as number) + Math.cos(mid) * radius;
					y = (element["y"] as number) + Math.sin(mid) * radius;
				} else if (typeof element["base"] === "number") {
					// Bar: label just past the free end of the bar.
					const top = element["y"] as number;
					const base = element["base"] as number;
					x = element["x"] as number;
					y = top + (top <= base ? -size * 0.82 : size * 0.82);
				} else if (typeof element["x"] === "number") {
					// Point (line, radar, scatter-like): label above, pushed outward for radar.
					x = element["x"] as number;
					y = (element["y"] as number) - size * 0.82;
					if (chartKind === "radar") {
						const centerX = chart.chartArea.left + chart.chartArea.width / 2;
						const centerY = chart.chartArea.top + chart.chartArea.height / 2;
						const dx = x - centerX;
						const dy = y - centerY;
						const distance = Math.hypot(dx, dy) || 1;
						x += (dx / distance) * size * 0.6;
						y += (dy / distance) * size * 0.6;
					}
				} else {
					continue;
				}
				// Skip labels that would collide horizontally with the previous one.
				if (!Number.isNaN(previousX) && Math.abs(x - previousX) < size * 3.4) continue;
				previousX = x;
				ctx.fillText(text, x, y);
			}
		}
		ctx.restore();
	},
};

function chartConfigIsRing(type: string): boolean {
	return type === "doughnut";
}

function formatChartValue(value: number): string {
	const abs = Math.abs(value);
	const trim = (number: number) => String(Math.round(number * 10) / 10).replace(/\.0$/, "");
	if (abs >= 1_000_000) return `${trim(value / 1_000_000)}M`;
	if (abs >= 10_000) return `${trim(value / 1_000)}k`;
	return String(Math.round(value * 100) / 100);
}

if (!Chart.registry.plugins.get("ssValueLabels")) {
	Chart.register(ssValueLabels);
}

interface ChartRendererProps {
	chartConfig: ChartConfig;
	className?: string;
	textColor?: string;
	gridColor?: string;
	palette?: readonly string[];
	fontFamily?: string;
	isActive?: boolean;
	/** Compact typography and tighter value labels for column-embedded charts. */
	density?: ChartDensity;
	/** Embedded mode suppresses the in-canvas title and description so the
	 * hosting block can render them as themed HTML text instead. */
	embedded?: boolean;
	showValues?: boolean;
	legendPosition?: "top" | "bottom" | "left" | "right";
}

const ChartRenderer: React.FC<ChartRendererProps> = ({
	chartConfig,
	className = "",
	textColor = "white",
	gridColor = "rgba(255, 255, 255, 0.1)",
	palette = [],
	fontFamily,
	isActive = true,
	density = "standard",
	embedded = false,
	showValues = true,
	legendPosition = "top",
}) => {
	const compact = density === "compact";
	const labelSize = compact ? 10 : 12;
	const valueSize = compact ? 10 : 12;

	const data = {
		...chartConfig.data,
		datasets: chartConfig.data.datasets.map((dataset, index) => {
			const color = palette.length > 0 ? palette[index % palette.length] : undefined;
			return {
				...dataset,
				backgroundColor: dataset.backgroundColor || color,
				borderColor: dataset.borderColor || color,
			};
		}),
	};
	const userPlugins = ((chartConfig.options?.["plugins"] as Record<string, unknown>) ||
		{}) as Record<string, Record<string, unknown> | undefined>;
	const defaultOptions = {
		responsive: true,
		maintainAspectRatio: false,
		animation: isActive
			? {
					duration: 1000,
					easing: "easeInOutQuart" as const,
				}
			: false,
		layout: {
			padding: { top: compact ? 16 : 22 },
		},
		plugins: {
			legend: {
				position: legendPosition,
				labels: {
					color: textColor,
					boxWidth: compact ? 10 : 14,
					font: {
						size: compact ? 11 : 14,
						family: fontFamily,
					},
				},
			},
			title: {
				display: !embedded && !!chartConfig.title,
				text: chartConfig.title,
				color: textColor,
				font: {
					size: compact ? 15 : 18,
					weight: "bold" as const,
					family: fontFamily,
				},
			},
			ssValueLabels: {
				display: showValues,
				color: textColor,
				size: valueSize,
				fontFamily,
			},
			tooltip: {
				backgroundColor: "rgba(0, 0, 0, 0.8)",
				titleColor: textColor,
				bodyColor: textColor,
				borderColor: "rgba(255, 255, 255, 0.2)",
				borderWidth: 1,
			},
		},
		scales:
			chartConfig.type !== "pie" &&
			chartConfig.type !== "doughnut" &&
			chartConfig.type !== "polarArea"
				? {
						x: {
							ticks: {
								color: textColor,
								font: { size: labelSize, family: fontFamily },
							},
							grid: {
								color: gridColor,
							},
						},
						y: {
							ticks: {
								color: textColor,
								font: { size: labelSize, family: fontFamily },
							},
							grid: {
								color: gridColor,
							},
						},
					}
				: {},
	};

	const mergedOptions = {
		...defaultOptions,
		...(chartConfig.options || {}),
		plugins: {
			...defaultOptions.plugins,
			...userPlugins,
			ssValueLabels: {
				...defaultOptions.plugins.ssValueLabels,
				...userPlugins["ssValueLabels"],
			},
		},
	};

	const renderChart = () => {
		const commonProps = {
			data,
			options: mergedOptions,
		};

		switch (chartConfig.type) {
			case "bar":
				return <Bar {...commonProps} options={mergedOptions as ChartOptions<"bar">} />;
			case "line":
				return <Line {...commonProps} options={mergedOptions as ChartOptions<"line">} />;
			case "pie":
				return <Pie {...commonProps} options={mergedOptions as ChartOptions<"pie">} />;
			case "doughnut":
				return <Doughnut {...commonProps} options={mergedOptions as ChartOptions<"doughnut">} />;
			case "radar":
				return <Radar {...commonProps} options={mergedOptions as ChartOptions<"radar">} />;
			case "polarArea":
				return <PolarArea {...commonProps} options={mergedOptions as ChartOptions<"polarArea">} />;
			default:
				return <Bar {...commonProps} options={mergedOptions as ChartOptions<"bar">} />;
		}
	};

	const description = embedded ? null : chartConfig.description;

	return (
		<div
			className={`w-full h-full flex flex-col ${className}`}
			key={isActive ? "active" : "inactive"}
		>
			<div className="flex-1 min-h-0 p-6">{renderChart()}</div>
			{description && (
				<div className="p-4 text-center">
					<p style={{ color: textColor }} className="text-sm opacity-80">
						{description}
					</p>
				</div>
			)}
		</div>
	);
};

export default ChartRenderer;
