import type { OoxmlTemplateManifest } from "./ooxml-template-renderer";

const simpleBusinessProposal: OoxmlTemplateManifest = {
	layouts: {
		cover: {
			sourceSlideNumber: 1,
			textSlots: {
				title: { shapeId: 51, value: "slide.title" },
				subtitle: { shapeId: 53, value: "slide.subtitle" },
				eyebrow: { shapeId: 52, value: "slide.eyebrow" },
				logo: { shapeId: 54, value: "empty" },
			},
		},
		section: {
			sourceSlideNumber: 8,
			textSlots: {
				title: { shapeId: 126, value: "slide.title" },
				subtitle: { shapeId: 125, value: "slide.subtitle" },
			},
		},
		body: {
			sourceSlideNumber: 7,
			textSlots: {
				title: { shapeId: 113, value: "slide.title" },
				main: { shapeId: 114, value: "slide.body" },
				primary: { shapeId: 115, value: "slide.primary" },
				secondary: { shapeId: 116, value: "slide.secondary" },
				mainLabel: { shapeId: 117, value: "empty" },
				primaryLabel: { shapeId: 118, value: "empty" },
				secondaryLabel: { shapeId: 119, value: "empty" },
			},
		},
		split: {
			sourceSlideNumber: 12,
			textSlots: {
				title: { shapeId: 187, value: "slide.title" },
				primaryLabel: { shapeId: 183, value: "empty" },
				secondaryLabel: { shapeId: 184, value: "empty" },
				primary: { shapeId: 185, value: "slide.primary" },
				secondary: { shapeId: 186, value: "slide.secondary" },
			},
		},
		comparison: {
			sourceSlideNumber: 5,
			textSlots: {
				title: { shapeId: 92, value: "slide.title" },
				subtitle: { shapeId: 96, value: "slide.subtitle" },
				primary: { shapeId: 97, value: "slide.primary" },
				secondary: { shapeId: 98, value: "slide.secondary" },
				extra: { shapeId: 99, value: "slide.body" },
				primaryMetric: { shapeId: 93, value: "empty" },
				secondaryMetric: { shapeId: 94, value: "empty" },
				tertiaryMetric: { shapeId: 95, value: "empty" },
			},
		},
		sidebar: {
			sourceSlideNumber: 6,
			textSlots: {
				title: { shapeId: 107, value: "slide.title" },
				body: { shapeId: 108, value: "slide.body" },
				eyebrow: { shapeId: 106, value: "slide.eyebrow" },
			},
		},
		"media-left": {
			sourceSlideNumber: 4,
			textSlots: {
				title: { shapeId: 85, value: "slide.title" },
				subtitle: { shapeId: 86, value: "slide.subtitle" },
				body: { shapeId: 87, value: "slide.body" },
			},
		},
		"media-right": {
			sourceSlideNumber: 2,
			textSlots: {
				title: { shapeId: 62, value: "slide.title" },
				subtitle: { shapeId: 61, value: "slide.subtitle" },
			},
		},
		quote: {
			sourceSlideNumber: 15,
			textSlots: {
				title: { shapeId: 217, value: "slide.title" },
				body: { shapeId: 216, value: "slide.body" },
			},
		},
		spotlight: {
			sourceSlideNumber: 14,
			textSlots: {
				title: { shapeId: 208, value: "slide.title" },
				body: { shapeId: 209, value: "slide.body" },
				eyebrow: { shapeId: 210, value: "slide.eyebrow" },
			},
		},
		canvas: {
			sourceSlideNumber: 9,
			textSlots: {
				title: { shapeId: 155, value: "slide.title" },
				subtitle: { shapeId: 156, value: "slide.subtitle" },
				main: { shapeId: 148, value: "slide.body" },
				primary: { shapeId: 150, value: "slide.primary" },
				secondary: { shapeId: 151, value: "slide.secondary" },
				media: { shapeId: 152, value: "slide.mediaCaption" },
				itemOneLabel: { shapeId: 147, value: "empty" },
				itemTwoLabel: { shapeId: 149, value: "empty" },
				itemThreeLabel: { shapeId: 154, value: "empty" },
				itemFourLabel: { shapeId: 153, value: "empty" },
			},
		},
	},
};

const manifests: Readonly<Record<string, OoxmlTemplateManifest>> = {
	"simple-business-proposal": simpleBusinessProposal,
};

export function getOoxmlTemplateManifest(templateId: string): OoxmlTemplateManifest | undefined {
	return manifests[templateId];
}

export function hasOoxmlTemplateManifest(templateId: string): boolean {
	return templateId in manifests;
}
