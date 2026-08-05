interface GenerationStatusState {
	slides: unknown[];
	requestedSlides: number;
	researchStatus?: "idle" | "searching" | "ready" | "generating";
	generationMessage?: string;
	generationProgress?: { completed: number; total: number };
}

export function getGenerationDisplayStatus(state: GenerationStatusState) {
	const stageTotal = state.generationProgress?.total || 0;
	const stageProgress =
		stageTotal > 0 ? (state.generationProgress?.completed || 0) / stageTotal : undefined;
	const slideProgress = state.requestedSlides > 0 ? state.slides.length / state.requestedSlides : 0;

	return {
		message:
			state.generationMessage ||
			(state.researchStatus === "searching"
				? "Finding relevant sources"
				: "Preparing your presentation"),
		progress: Math.max(0, Math.min(stageProgress ?? slideProgress, 1)),
	};
}
