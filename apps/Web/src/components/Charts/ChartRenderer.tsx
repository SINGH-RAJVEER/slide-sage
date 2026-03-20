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

interface ChartData {
    type: "bar" | "line" | "pie" | "doughnut" | "radar" | "polarArea";
    data: {
        labels: string[];
        datasets: Array<{
            label: string;
            data: number[];
            backgroundColor?: string | string[];
            borderColor?: string | string[];
            borderWidth?: number;
            fill?: boolean;
        }>;
    };
    options?: Record<string, unknown>;
    title?: string;
    description?: string;
}

interface ChartRendererProps {
    chartConfig: ChartData;
    className?: string;
    textColor?: string;
    isActive?: boolean;
}

const ChartRenderer: React.FC<ChartRendererProps> = ({
    chartConfig,
    className = "",
    textColor = "white",
    isActive = true,
}) => {
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
                    },
                },
            },
            title: {
                display: !!chartConfig.title,
                text: chartConfig.title,
                color: textColor,
                font: {
                    size: 18,
                    weight: "bold",
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
                              color: "rgba(255, 255, 255, 0.1)",
                          },
                      },
                      y: {
                          ticks: {
                              color: textColor,
                          },
                          grid: {
                              color: "rgba(255, 255, 255, 0.1)",
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
            data: chartConfig.data,
            options: mergedOptions,
        };

        switch (chartConfig.type) {
            case "bar":
                return <Bar {...commonProps} />;
            case "line":
                return <Line {...commonProps} />;
            case "pie":
                return <Pie {...commonProps} />;
            case "doughnut":
                return <Doughnut {...commonProps} />;
            case "radar":
                return <Radar {...commonProps} />;
            case "polarArea":
                return <PolarArea {...commonProps} />;
            default:
                return <Bar {...commonProps} />;
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
