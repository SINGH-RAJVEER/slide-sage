import type { ChartConfig } from "@slidesage/types";
import type { ChartOptions } from "chart.js";
import {
	ArcElement,
	BarElement,
	CategoryScale,
	Chart as ChartJS,
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
ChartJS.register(
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

interface ChartRendererProps {
	chartConfig: ChartConfig;
	className?: string;
	textColor?: string;
	gridColor?: string;
	palette?: readonly string[];
	fontFamily?: string;
	isActive?: boolean;
}

const ChartRenderer: React.FC<ChartRendererProps> = ({
	chartConfig,
	className = "",
	textColor = "white",
	gridColor = "rgba(255, 255, 255, 0.1)",
	palette = [],
	fontFamily,
	isActive = true,
}) => {
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
	const defaultOptions = {
		responsive: true,
		maintainAspectRatio: false,
		animation: isActive
			? {
					duration: 1000,
					easing: "easeInOutQuart" as const,
				}
			: false,
		plugins: {
			legend: {
				position: "top" as const,
				labels: {
					color: textColor,
					font: {
						size: 14,
						family: fontFamily,
					},
				},
			},
			title: {
				display: !!chartConfig.title,
				text: chartConfig.title,
				color: textColor,
				font: {
					size: 18,
					weight: "bold" as const,
					family: fontFamily,
				},
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
							},
							grid: {
								color: gridColor,
							},
						},
						y: {
							ticks: {
								color: textColor,
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
		...chartConfig.options,
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

	return (
		<div
			className={`w-full h-full flex flex-col ${className}`}
			key={isActive ? "active" : "inactive"}
		>
			<div className="flex-1 min-h-0 p-6">{renderChart()}</div>
			{chartConfig.description && (
				<div className="p-4 text-center">
					<p style={{ color: textColor }} className="text-sm opacity-80">
						{chartConfig.description}
					</p>
				</div>
			)}
		</div>
	);
};

export default ChartRenderer;
