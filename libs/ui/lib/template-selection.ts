import { BINARY_PPTX_TEMPLATE_CATALOG, type PresentationTemplateReference } from "@slidesage/types";
import { hasOoxmlTemplateManifest } from "./ooxml-template-manifests";

export const templateIsSelectable = (reference: PresentationTemplateReference) => {
	const template = BINARY_PPTX_TEMPLATE_CATALOG.find(
		(entry) => entry.id === reference.id && entry.version === reference.version,
	);

	return template?.asset.status === "available" && hasOoxmlTemplateManifest(reference.id);
};
