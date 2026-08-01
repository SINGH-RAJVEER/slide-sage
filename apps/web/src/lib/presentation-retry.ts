import type { PresentationJSON } from "@slidesage/types";
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
                theme: retry.theme ?? "corporate-blue",
                researchPayload: retry.research_payload,
                retryPresentationId: presentationId,
                ...(retry.ai ? { ai: retry.ai } : {}),
            },
        };
    }

    return {
        to: ROUTES.generate,
        state: { retry, retryPresentationId: presentationId },
    };
}
