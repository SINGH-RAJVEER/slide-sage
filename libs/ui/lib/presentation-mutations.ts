import type {
	PresentationData,
	PresentationMutation,
	PresentationResponse,
} from "@slidesage/types";
import { API_URL } from "./api";

const mutationQueues = new Map<string, Promise<void>>();

export async function persistPresentationMutations(
	presentationId: string,
	mutations: PresentationMutation[],
): Promise<PresentationData> {
	const previous = mutationQueues.get(presentationId) || Promise.resolve();
	const operation = previous
		.catch(() => undefined)
		.then(async () => {
			const response = await fetch(`${API_URL}/presentations/${presentationId}`, {
				method: "PATCH",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ mutations }),
			});
			const body = (await response.json().catch(() => null)) as PresentationResponse | null;
			if (!response.ok || !body?.presentation?.slides_data) {
				throw new Error("Failed to save presentation changes");
			}
			const document = body.presentation.slides_data;
			return {
				...document,
				totalSlides: document.totalSlides ?? document.slides.length,
			};
		});
	mutationQueues.set(
		presentationId,
		operation.then(
			() => undefined,
			() => undefined,
		),
	);
	return operation;
}
