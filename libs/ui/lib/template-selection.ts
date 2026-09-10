import { BINARY_PPTX_TEMPLATE_CATALOG, type PresentationTemplateReference } from "@slidesage/types";

/**
 * A template is selectable once its digest-pinned package is published. Slot
 * manifests are resolved by the compiler, so the browser no longer checks them.
 */
export const templateIsSelectable = (reference: PresentationTemplateReference) =>
	BINARY_PPTX_TEMPLATE_CATALOG.some(
		(entry) =>
			entry.id === reference.id &&
			entry.version === reference.version &&
			entry.asset.status === "available",
	);
