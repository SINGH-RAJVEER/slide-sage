// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// Adapted from Bento Slides' framework-neutral animation engine.

export type EasingName = "linear" | "ease-out" | "ease-in-out";

function ease(name: EasingName, progress: number): number {
	if (name === "ease-out") return 1 - (1 - progress) ** 3;
	if (name === "ease-in-out") {
		return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
	}
	return progress;
}

export interface TweenOptions {
	from: number;
	to: number;
	durationMs: number;
	easing?: EasingName;
	onUpdate: (value: number) => void;
	onComplete?: () => void;
}

export function tweenNumber(options: TweenOptions): () => void {
	if (
		options.durationMs <= 0 ||
		globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
	) {
		options.onUpdate(options.to);
		options.onComplete?.();
		return () => undefined;
	}

	let frame = 0;
	let cancelled = false;
	const startedAt = performance.now();
	const tick = (now: number) => {
		if (cancelled) return;
		const progress = Math.min(1, Math.max(0, (now - startedAt) / options.durationMs));
		const value =
			options.from + (options.to - options.from) * ease(options.easing || "ease-out", progress);
		options.onUpdate(value);
		if (progress >= 1) {
			options.onComplete?.();
			return;
		}
		frame = requestAnimationFrame(tick);
	};
	frame = requestAnimationFrame(tick);

	return () => {
		cancelled = true;
		cancelAnimationFrame(frame);
	};
}
