import {
    type ResolvedSceneNode,
    resolveScene,
    type SceneResponsiveProfile,
    type SceneSlide,
} from "@slide-sage/types";
import { Image as ImageIcon } from "lucide-react";
import React from "react";
import { SceneWidget } from "./scene-widget-registry";

const THEME_COLORS: Record<
    string,
    { background: string; foreground: string; muted: string; accent: string }
> = {
    "corporate-blue": {
        background: "#eef4ff",
        foreground: "#102448",
        muted: "#5f708f",
        accent: "#2864dc",
    },
    "modern-dark": {
        background: "#111827",
        foreground: "#f2f5fb",
        muted: "#9aa7bd",
        accent: "#5dc7e8",
    },
    minimalist: {
        background: "#f8f7f3",
        foreground: "#24211d",
        muted: "#746f67",
        accent: "#b25635",
    },
    "creative-studio": {
        background: "#fff2ed",
        foreground: "#391827",
        muted: "#8c6070",
        accent: "#d24170",
    },
    "elegant-serif": {
        background: "#f4f0e8",
        foreground: "#2c2822",
        muted: "#756d62",
        accent: "#8b6847",
    },
    "nature-green": {
        background: "#edf5eb",
        foreground: "#183423",
        muted: "#617567",
        accent: "#2f7a4d",
    },
};

function nodeCss(node: ResolvedSceneNode, parent: ResolvedSceneNode): React.CSSProperties {
    return {
        position: "absolute",
        left: node.bounds.x - parent.bounds.x,
        top: node.bounds.y - parent.bounds.y,
        width: node.bounds.width,
        height: node.bounds.height,
        zIndex: node.zIndex ?? node.order,
        transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
        opacity: node.style?.opacity,
        color: node.style?.color,
        background: node.style?.fill,
        border: node.style?.stroke
            ? `${node.style.strokeWidth || 1}px solid ${node.style.stroke}`
            : undefined,
        borderRadius: node.style?.radius,
        boxShadow: node.style?.shadow,
        overflow: node.type === "group" ? "visible" : "hidden",
        boxSizing: "border-box",
    };
}

function SceneNodeView({
    node,
    parent,
    foreground,
    muted,
    accent,
    isActive,
}: {
    node: ResolvedSceneNode;
    parent: ResolvedSceneNode;
    foreground: string;
    muted: string;
    accent: string;
    isActive: boolean;
}) {
    if (node.hidden) return null;
    const style = nodeCss(node, parent);
    if (node.type === "group") {
        return (
            <div data-scene-node-id={node.id} style={style}>
                {node.children?.map((child) => (
                    <SceneNodeView
                        key={child.id}
                        node={child}
                        parent={node}
                        foreground={foreground}
                        muted={muted}
                        accent={accent}
                        isActive={isActive}
                    />
                ))}
            </div>
        );
    }
    if (node.type === "text") {
        const roleSize = {
            display: 64,
            title: 48,
            subtitle: 25,
            body: 22,
            caption: 15,
            label: 14,
        }[node.role || "body"];
        const TextElement = node.role === "title" || node.role === "display" ? "h1" : "div";
        return (
            <TextElement
                data-scene-node-id={node.id}
                style={{
                    ...style,
                    display: "flex",
                    alignItems:
                        node.role === "title" || node.role === "display"
                            ? "flex-end"
                            : "flex-start",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    color:
                        node.style?.color ||
                        (node.role === "subtitle" || node.role === "caption" ? muted : foreground),
                    fontFamily:
                        node.style?.fontFamily ||
                        (node.role === "display"
                            ? "Georgia, serif"
                            : "Avenir Next, Segoe UI, sans-serif"),
                    fontSize: node.style?.fontSize || roleSize,
                    fontWeight:
                        node.style?.fontWeight ||
                        (node.role === "title" || node.role === "display" ? 650 : 400),
                    lineHeight: node.style?.lineHeight || 1.16,
                    letterSpacing: node.style?.letterSpacing,
                    textAlign: node.style?.textAlign,
                }}
            >
                {node.text}
            </TextElement>
        );
    }
    if (node.type === "image") {
        return <SceneImage node={node} style={style} accent={accent} muted={muted} />;
    }
    if (node.type === "shape") {
        return (
            <div
                aria-hidden="true"
                data-scene-node-id={node.id}
                style={{
                    ...style,
                    ...(node.shape === "ellipse" ? { borderRadius: "50%" } : {}),
                    ...(node.shape === "line"
                        ? {
                              height: node.style?.strokeWidth || 2,
                              background: node.style?.stroke || accent,
                          }
                        : {}),
                }}
            />
        );
    }
    return (
        <div data-scene-node-id={node.id} style={style}>
            <SceneWidget node={node} foreground={foreground} accent={accent} isActive={isActive} />
        </div>
    );
}

function SceneImage({
    node,
    style,
    accent,
    muted,
}: {
    node: ResolvedSceneNode;
    style: React.CSSProperties;
    accent: string;
    muted: string;
}) {
    const [failed, setFailed] = React.useState(false);
    return (
        <figure
            data-scene-node-id={node.id}
            style={{ ...style, margin: 0, background: `${accent}12`, color: muted }}
        >
            {node.url && !failed ? (
                <img
                    src={node.url}
                    alt={node.alt || ""}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setFailed(true)}
                    className="h-full w-full"
                    style={{
                        objectFit: node.fit || "cover",
                        objectPosition: node.focalPoint
                            ? `${node.focalPoint.x * 100}% ${node.focalPoint.y * 100}%`
                            : "center",
                    }}
                />
            ) : (
                <div
                    role="img"
                    aria-label={node.alt}
                    className="flex h-full w-full flex-col items-center justify-center gap-3 border border-dashed border-current/30 p-8 text-center"
                >
                    <ImageIcon className="h-10 w-10" />
                    <span className="max-w-xs text-sm">{node.alt}</span>
                </div>
            )}
        </figure>
    );
}

export function SceneRenderer({
    slide,
    currentTemplate,
    isActive,
    profile = "wide",
    dimensions = { width: 1280, height: 720 },
}: {
    slide: SceneSlide;
    currentTemplate: string;
    isActive: boolean;
    profile?: SceneResponsiveProfile;
    dimensions?: { width: number; height: number };
}) {
    const resolved = resolveScene(slide, dimensions, profile);
    const theme = THEME_COLORS[currentTemplate] || THEME_COLORS["corporate-blue"];
    if (!theme) return null;
    const art = slide.artDirection;
    const background = art?.background || theme.background;
    const foreground = art?.foreground || theme.foreground;
    const muted = art?.muted || theme.muted;
    const accent = art?.accent || theme.accent;
    return (
        <div
            className="relative h-full w-full overflow-hidden"
            data-pdf-slide
            style={{ background, color: foreground }}
            data-scene-slide-id={slide.id}
            data-scene-profile={profile}
        >
            {resolved.root.children?.map((node) => (
                <SceneNodeView
                    key={node.id}
                    node={node}
                    parent={resolved.root}
                    foreground={foreground}
                    muted={muted}
                    accent={accent}
                    isActive={isActive}
                />
            ))}
        </div>
    );
}
