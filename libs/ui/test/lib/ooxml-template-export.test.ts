import { describe, expect, it, mock } from "bun:test";
import { BINARY_PPTX_TEMPLATE_CATALOG, type PresentationData } from "@slidesage/types";
import { buildOoxmlTemplatePptx } from "@slidesage/ui/lib/ooxml-template-export";
import { getOoxmlTemplateManifest } from "@slidesage/ui/lib/ooxml-template-manifests";

function presentation(templateId: string): PresentationData {
	return {
		title: "Template export",
		theme: "corporate-blue",
		template: { id: templateId, version: 1 },
		totalSlides: 1,
		slides: [
			{
				id: "cover",
				type: "content",
				layout: "cover",
				title: "Opening",
				subtitle: "Proposal",
				tone: "default",
				density: "standard",
				pattern: "none",
				blocks: [],
			},
		],
	};
}

describe("OOXML template export", () => {
	it("registers every semantic content layout for the onboarded template", () => {
		const manifest = getOoxmlTemplateManifest("simple-business-proposal");
		expect(Object.keys(manifest?.layouts ?? {}).sort()).toEqual(
			[
				"body",
				"canvas",
				"comparison",
				"cover",
				"media-left",
				"media-right",
				"quote",
				"section",
				"sidebar",
				"split",
				"spotlight",
			].sort(),
		);
	});

	it("rejects presentations without a selected template", async () => {
		const withoutTemplate = presentation("simple-business-proposal");
		withoutTemplate.template = undefined;

		await expect(
			buildOoxmlTemplatePptx(withoutTemplate, { publicBaseUrl: "https://cdn.example.com/" }),
		).rejects.toThrow("does not select a PowerPoint template");
	});

	it("rejects unknown and not-yet-onboarded templates before downloading", async () => {
		const fetcher = mock(() => Promise.resolve(new Response(null, { status: 404 })));

		await expect(
			buildOoxmlTemplatePptx(presentation("missing-template"), {
				publicBaseUrl: "https://cdn.example.com/",
				fetcher,
			}),
		).rejects.toThrow('template "missing-template" version 1 is unknown');
		await expect(
			buildOoxmlTemplatePptx(presentation("5s-training"), {
				publicBaseUrl: "https://cdn.example.com/",
				fetcher,
			}),
		).rejects.toThrow("is pending asset upload");
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("marks only the onboarded runtime asset available", () => {
		expect(
			BINARY_PPTX_TEMPLATE_CATALOG.filter((entry) => entry.asset.status === "available").map(
				(entry) => entry.id,
			),
		).toEqual(["simple-business-proposal"]);
	});

	it("rejects missing storage configuration", async () => {
		await expect(
			buildOoxmlTemplatePptx(presentation("simple-business-proposal"), {
				publicBaseUrl: "  ",
			}),
		).rejects.toThrow("template storage is not configured");
	});

	it("rejects unsupported slide kinds before downloading", async () => {
		const withChart = presentation("simple-business-proposal");
		withChart.slides = [
			{
				id: "chart",
				type: "chart",
				chartConfig: {
					type: "bar",
					data: { labels: ["Q1"], datasets: [{ label: "Revenue", data: [12] }] },
				},
			},
		];
		const fetcher = mock(() => Promise.resolve(new Response(null, { status: 200 })));

		await expect(
			buildOoxmlTemplatePptx(withChart, {
				publicBaseUrl: "https://cdn.example.com/",
				fetcher,
			}),
		).rejects.toThrow("supports content slides only. Slide 1 is chart");
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("rejects rich blocks and unmapped regions instead of dropping content", async () => {
		const withImage = presentation("simple-business-proposal");
		const contentSlide = withImage.slides[0];
		if (contentSlide?.type !== "content") throw new Error("Expected content slide");
		contentSlide.blocks = [
			{
				type: "image",
				region: "media",
				url: "https://example.com/image.png",
				alt: "Image",
				caption: "",
			},
		];
		await expect(
			buildOoxmlTemplatePptx(withImage, { publicBaseUrl: "https://cdn.example.com/" }),
		).rejects.toThrow("contains image content");

		const withUnmappedBody = presentation("simple-business-proposal");
		const mediaRight = withUnmappedBody.slides[0];
		if (mediaRight?.type !== "content") throw new Error("Expected content slide");
		mediaRight.layout = "media-right";
		mediaRight.blocks = [{ type: "paragraph", region: "main", text: "Do not discard me" }];
		await expect(
			buildOoxmlTemplatePptx(withUnmappedBody, { publicBaseUrl: "https://cdn.example.com/" }),
		).rejects.toThrow('unmapped "main" region');

		const withBackground = presentation("simple-business-proposal");
		const backgroundSlide = withBackground.slides[0];
		if (backgroundSlide?.type !== "content") throw new Error("Expected content slide");
		backgroundSlide.backgroundImage = {
			url: "https://example.com/background.png",
			alt: "Background",
			focalPoint: "center",
			overlay: "medium",
		};
		await expect(
			buildOoxmlTemplatePptx(withBackground, { publicBaseUrl: "https://cdn.example.com/" }),
		).rejects.toThrow("contains a background image");
	});

	it("downloads the versioned template path and reports storage failures", async () => {
		const fetcher = mock(() => Promise.resolve(new Response(null, { status: 503 })));

		await expect(
			buildOoxmlTemplatePptx(presentation("simple-business-proposal"), {
				publicBaseUrl: "https://cdn.example.com/assets",
				fetcher,
			}),
		).rejects.toThrow('Simple Business Proposal" (503)');
		expect(fetcher).toHaveBeenCalledWith(
			"https://cdn.example.com/assets/pptx-templates/v1/simple-business-proposal.pptx",
		);
	});
});
