import type { SceneNode, SceneNodePatch, SceneSlide } from "./scene";

export type SceneCommand =
    | { type: "set-text"; nodeId: string; text: string }
    | { type: "set-style"; nodeId: string; style: NonNullable<SceneNode["style"]> }
    | { type: "set-bounds"; nodeId: string; bounds: NonNullable<SceneNode["bounds"]> }
    | { type: "insert-node"; parentId: string; node: SceneNode }
    | { type: "delete-node"; nodeId: string }
    | { type: "reorder-node"; nodeId: string; order: number }
    | {
          type: "set-responsive-override";
          profile: "wide" | "standard" | "portrait" | "compact";
          patch: SceneNodePatch;
      };

function updateNode(
    node: SceneNode,
    nodeId: string,
    update: (current: SceneNode) => SceneNode | null,
): SceneNode | null {
    if (node.id === nodeId) return update(node);
    if (node.type !== "group") return node;
    return {
        ...node,
        children: node.children
            .map((child) => updateNode(child, nodeId, update))
            .filter((child): child is SceneNode => child !== null),
    };
}

export function findSceneNode(root: SceneNode, nodeId: string): SceneNode | undefined {
    if (root.id === nodeId) return root;
    if (root.type !== "group") return undefined;
    for (const child of root.children) {
        const found = findSceneNode(child, nodeId);
        if (found) return found;
    }
    return undefined;
}

export function applySceneCommand(slide: SceneSlide, command: SceneCommand): SceneSlide {
    if (command.type === "set-responsive-override") {
        const variants = [...(slide.variants || [])];
        const index = variants.findIndex((variant) => variant.profile === command.profile);
        const variant = index >= 0 ? variants[index] : undefined;
        const patches = [...(variant?.patches || [])];
        const patchIndex = patches.findIndex((patch) => patch.nodeId === command.patch.nodeId);
        if (patchIndex >= 0) patches[patchIndex] = { ...patches[patchIndex], ...command.patch };
        else patches.push(command.patch);
        const nextVariant = { profile: command.profile, patches, root: variant?.root };
        if (index >= 0) variants[index] = nextVariant;
        else variants.push(nextVariant);
        return { ...slide, variants };
    }

    let nextRoot: SceneNode | null = slide.root;
    if (command.type === "insert-node") {
        nextRoot = updateNode(slide.root, command.parentId, (node) =>
            node.type === "group" ? { ...node, children: [...node.children, command.node] } : node,
        );
    } else if (command.type === "delete-node") {
        if (command.nodeId === slide.root.id) throw new Error("The scene root cannot be deleted");
        nextRoot = updateNode(slide.root, command.nodeId, () => null);
    } else if (command.type === "set-text") {
        nextRoot = updateNode(slide.root, command.nodeId, (node) =>
            node.type === "text" ? { ...node, text: command.text.slice(0, 20000) } : node,
        );
    } else if (command.type === "set-style") {
        nextRoot = updateNode(slide.root, command.nodeId, (node) => ({
            ...node,
            style: { ...node.style, ...command.style },
        }));
    } else if (command.type === "set-bounds") {
        nextRoot = updateNode(slide.root, command.nodeId, (node) => ({
            ...node,
            bounds: command.bounds,
        }));
    } else {
        nextRoot = updateNode(slide.root, command.nodeId, (node) => ({
            ...node,
            order: command.order,
        }));
    }
    if (!nextRoot || nextRoot.type !== "group") throw new Error("Invalid scene command result");
    return { ...slide, root: nextRoot };
}

export function invertSceneCommand(slide: SceneSlide, command: SceneCommand): SceneCommand | null {
    if (command.type === "insert-node") return { type: "delete-node", nodeId: command.node.id };
    if (command.type === "set-responsive-override") return null;
    const node = findSceneNode(slide.root, command.nodeId);
    if (!node) return null;
    if (command.type === "set-text" && node.type === "text") {
        return { type: "set-text", nodeId: node.id, text: node.text };
    }
    if (command.type === "set-style") {
        return { type: "set-style", nodeId: node.id, style: node.style || {} };
    }
    if (command.type === "set-bounds" && node.bounds) {
        return { type: "set-bounds", nodeId: node.id, bounds: node.bounds };
    }
    if (command.type === "reorder-node") {
        return { type: "reorder-node", nodeId: node.id, order: node.order };
    }
    return null;
}
