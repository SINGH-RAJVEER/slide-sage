export const PRESENTATIONS_UPDATED_EVENT = "slidesage:presentations-updated";

export interface PresentationUpdatedDetail {
	presentationId: string;
}

export function publishPresentationUpdated(presentationId: unknown): void {
	if (typeof presentationId !== "string" || !presentationId) return;

	window.dispatchEvent(
		new CustomEvent<PresentationUpdatedDetail>(PRESENTATIONS_UPDATED_EVENT, {
			detail: { presentationId },
		}),
	);
}
