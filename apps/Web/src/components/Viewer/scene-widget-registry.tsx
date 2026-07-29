import type { ChartConfig, ResolvedSceneNode } from "@slide-sage/types";
import { Image as ImageIcon } from "lucide-react";
import type React from "react";
import ChartRenderer from "@/components/Charts/ChartRenderer";

interface SceneWidgetProps {
    node: ResolvedSceneNode;
    foreground: string;
    accent: string;
    isActive: boolean;
}

type SceneWidgetRenderer = React.ComponentType<SceneWidgetProps>;

function widgetProps(node: ResolvedSceneNode): Record<string, unknown> {
    return node.props || {};
}

function ChartWidget({ node, foreground, isActive }: SceneWidgetProps) {
    const chartConfig = widgetProps(node)["chartConfig"] as ChartConfig | undefined;
    if (!chartConfig) return <WidgetFallback node={node} />;
    return (
        <ChartRenderer
            chartConfig={chartConfig}
            className="h-full w-full"
            textColor={foreground}
            isActive={isActive}
        />
    );
}

function TableWidget({ node, foreground, accent }: SceneWidgetProps) {
    const values = widgetProps(node);
    const headers = Array.isArray(values["headers"]) ? (values["headers"] as string[]) : [];
    const rows = Array.isArray(values["rows"]) ? (values["rows"] as string[][]) : [];
    return (
        <table
            className="h-full w-full table-fixed border-collapse text-left"
            style={{ color: foreground }}
        >
            <thead>
                <tr>
                    {headers.map((header) => (
                        <th
                            key={header}
                            className="border-b px-3 py-2 text-sm font-semibold"
                            style={{ borderColor: accent }}
                        >
                            {header}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row) => (
                    <tr key={JSON.stringify(row)}>
                        {headers.map((header, cellIndex) => (
                            <td
                                key={`${header}-${row[cellIndex] || ""}`}
                                className="border-b border-current/10 px-3 py-2 text-sm"
                            >
                                {row[cellIndex] || ""}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function StatsWidget({ node, foreground, accent }: SceneWidgetProps) {
    const items = Array.isArray(widgetProps(node)["items"])
        ? (widgetProps(node)["items"] as Array<{ value?: string; label?: string }>)
        : [];
    return (
        <div className="grid h-full w-full auto-cols-fr grid-flow-col gap-4">
            {items.map((item) => (
                <div
                    key={`${item.value}-${item.label}`}
                    className="flex flex-col justify-end border-t pt-4"
                    style={{ borderColor: accent }}
                >
                    <strong className="text-4xl font-semibold" style={{ color: accent }}>
                        {item.value}
                    </strong>
                    <span className="mt-2 text-sm" style={{ color: foreground, opacity: 0.72 }}>
                        {item.label}
                    </span>
                </div>
            ))}
        </div>
    );
}

function QuoteWidget({ node, foreground, accent }: SceneWidgetProps) {
    const values = widgetProps(node);
    return (
        <figure
            className="flex h-full flex-col justify-center border-l-4 pl-7"
            style={{ borderColor: accent, color: foreground }}
        >
            <blockquote className="text-3xl font-medium leading-tight">
                {String(values["text"] || "")}
            </blockquote>
            {values["attribution"] ? (
                <figcaption className="mt-5 text-sm opacity-60">
                    {String(values["attribution"])}
                </figcaption>
            ) : null}
        </figure>
    );
}

function CalloutWidget({ node, foreground, accent }: SceneWidgetProps) {
    const values = widgetProps(node);
    return (
        <div
            className="flex h-full flex-col justify-center rounded-2xl p-6"
            style={{
                color: foreground,
                background: `${accent}18`,
                border: `1px solid ${accent}44`,
            }}
        >
            {values["heading"] ? (
                <strong className="mb-2 text-lg">{String(values["heading"])}</strong>
            ) : null}
            <p className="text-base leading-relaxed opacity-80">{String(values["text"] || "")}</p>
        </div>
    );
}

function DiagramWidget({ node, foreground, accent }: SceneWidgetProps) {
    const values = widgetProps(node);
    const items = Array.isArray(values["nodes"])
        ? (values["nodes"] as Array<{
              label?: string;
              value?: string;
              description?: string;
          }>)
        : Array.isArray(values["items"])
          ? (values["items"] as Array<string | { title?: string; description?: string }>)
          : [];
    return (
        <div className="grid h-full w-full grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] items-center gap-4">
            {items.map((item, index) => {
                const record =
                    typeof item === "string"
                        ? undefined
                        : (item as {
                              label?: string;
                              value?: string;
                              title?: string;
                              description?: string;
                          });
                const title =
                    typeof item === "string"
                        ? item
                        : record?.label || record?.value || record?.title || `Step ${index + 1}`;
                const description = typeof item === "string" ? "" : item.description || "";
                return (
                    <div
                        key={`${title}-${description}`}
                        className="relative flex min-h-28 flex-col justify-center rounded-xl border p-4"
                        style={{ borderColor: `${accent}66`, color: foreground }}
                    >
                        <span
                            className="mb-2 text-xs font-semibold uppercase tracking-widest"
                            style={{ color: accent }}
                        >
                            {String(index + 1).padStart(2, "0")}
                        </span>
                        <strong>{title}</strong>
                        {description ? (
                            <span className="mt-1 text-xs opacity-60">{description}</span>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}

function WidgetFallback({ node }: { node: ResolvedSceneNode }) {
    return (
        <div
            role="img"
            aria-label={node.ariaLabel || `${node.kind || "Unknown"} widget`}
            className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-current/30 p-6 text-center opacity-60"
        >
            <ImageIcon aria-hidden="true" className="h-8 w-8" />
            <span className="text-sm font-medium">{node.kind || "Unsupported widget"}</span>
        </div>
    );
}

const REGISTRY: Partial<Record<NonNullable<ResolvedSceneNode["kind"]>, SceneWidgetRenderer>> = {
    chart: ChartWidget,
    table: TableWidget,
    stats: StatsWidget,
    quote: QuoteWidget,
    callout: CalloutWidget,
    timeline: DiagramWidget,
    process: DiagramWidget,
    comparison: DiagramWidget,
    architecture: DiagramWidget,
};

export function SceneWidget(componentProps: SceneWidgetProps) {
    const Renderer = componentProps.node.kind ? REGISTRY[componentProps.node.kind] : undefined;
    return Renderer ? (
        <Renderer {...componentProps} />
    ) : (
        <WidgetFallback node={componentProps.node} />
    );
}
