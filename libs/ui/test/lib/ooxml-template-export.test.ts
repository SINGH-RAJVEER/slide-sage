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
		).rejects.toThrow("has not completed OOXML onboarding");
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("rejects pending template assets before downloading", async () => {
		const fetcher = mock(() => Promise.resolve(new Response(null, { status: 200 })));

		await expect(
			buildOoxmlTemplatePptx(presentation("simple-business-proposal"), {
				publicBaseUrl: "https://cdn.example.com/",
				fetcher,
			}),
		).rejects.toThrow('template "Simple Business Proposal" is pending asset upload');
		expect(fetcher).not.toHaveBeenCalled();
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
		).rejects.toThrow('Unsupported PowerPoint slide kind "chart" at slide 1');
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("downloads the versioned template path and reports storage failures", async () => {
		const template = BINARY_PPTX_TEMPLATE_CATALOG.find(
			(entry) => entry.id === "simple-business-proposal",
		);
		if (!template) throw new Error("Test template is missing from the catalog");
		const originalStatus = template.asset.status;
		template.asset.status = "available";
		const fetcher = mock(() => Promise.resolve(new Response(null, { status: 503 })));

		try {
			await expect(
				buildOoxmlTemplatePptx(presentation("simple-business-proposal"), {
					publicBaseUrl: "https://cdn.example.com/assets",
					fetcher,
				}),
			).rejects.toThrow('Simple Business Proposal" (503)');
			expect(fetcher).toHaveBeenCalledWith(
				"https://cdn.example.com/assets/pptx-templates/v1/simple-business-proposal.pptx",
			);
		} finally {
			template.asset.status = originalStatus;
		}
	});
});
