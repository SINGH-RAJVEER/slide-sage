import type { PresentationJSON } from "@slide-sage/types";
import { ROUTES } from "@/router/paths";

export function getPresentationRetryDestination(
    presentation: PresentationJSON,
    presentationId: string,
) {
    const retry = presentation.status === "failed" ? presentation.failure?.retry : undefined;
    if (!retry) return null;

    if (retry.research_payload?.sources.length) {
        return {
            to: ROUTES.research,
            state: {
                prompt: retry.prompt,
                slideCount: retry.slide_count,
                detailLevel: retry.detail_level,
                tonality: retry.tonality,
                researchPayload: retry.research_payload,
                retryPresentationId: presentationId,
            },
        };
    }

    return {
        to: ROUTES.generate,
        state: { retry, retryPresentationId: presentationId },
    };
}
