import { ThinkingOrb as Orb, type ThinkingOrbProps } from "thinking-orbs";

/**
 * SlideSage standardizes on the "solving" orb everywhere, pinned to the dark
 * theme (light dots) since the interface is fixed dark ink and should not
 * rely on prefers-color-scheme.
 */
function ThinkingOrb({ state = "solving", theme = "dark", ...props }: ThinkingOrbProps) {
	return <Orb state={state} theme={theme} {...props} />;
}

export type { OrbSize, OrbState, ThinkingOrbProps } from "thinking-orbs";
export { ThinkingOrb };
