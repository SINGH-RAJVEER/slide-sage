/// <reference lib="dom" />

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { PresentationData } from "@slidesage/types";
import { act } from "@testing-library/react";

const addPage = mock(() => {});
const addImage = mock(() => {});
const save = mock(() => {});
const toJpeg = mock(
	async (_element: HTMLElement, _options?: Record<string, unknown>) =>
		"data:image/jpeg;base64,presentation-slide",
);

class MockJsPdf {
	addPage = addPage;
	addImage = addImage;
	save = save;
}

mock.module("html-to-image", () => ({ toJpeg }));
mock.module("jspdf", () => ({ jsPDF: MockJsPdf }));

const { exportPresentationPdf } = await import("@/lib/pdf-export");

describe("PDF export", () => {
	const presentation: PresentationData = {
		title: "Quarterly: Review?",
		theme: "corporate-blue",
		totalSlides: 2,
		slides: [
			{
				id: "one",
				type: "content",
				layout: "body",
				title: "First slide",
				subtitle: "",
				tone: "default",
				density: "standard",
				pattern: "none",
				blocks: [{ id: "copy-one", type: "paragraph", region: "main", text: "First" }],
			},
			{
				id: "two",
				type: "content",
				layout: "body",
				title: "Second slide",
				subtitle: "",
				tone: "default",
				density: "standard",
				pattern: "none",
				blocks: [{ id: "copy-two", type: "paragraph", region: "main", text: "Second" }],
			},
		],
	};

	beforeEach(() => {
		addPage.mockClear();
		addImage.mockClear();
		save.mockClear();
		toJpeg.mockClear();
		document.body.innerHTML = "";
	});

	it("writes each rendered slide to an ordered widescreen PDF page", async () => {
		await act(async () => exportPresentationPdf(presentation, "corporate-blue"));

		expect(toJpeg).toHaveBeenCalledTimes(2);
		expect(toJpeg.mock.calls[0]?.[1]).toMatchObject({
			canvasWidth: 2560,
			canvasHeight: 1440,
			width: 1280,
			height: 720,
		});
		expect(addImage).toHaveBeenCalledTimes(2);
		expect(addPage).toHaveBeenCalledTimes(1);
		expect(save).toHaveBeenCalledWith("Quarterly_ Review_.pdf");
	});

	it("rejects export when the saved presentation has no slides", async () => {
		await expect(
			exportPresentationPdf({ ...presentation, slides: [], totalSlides: 0 }, "corporate-blue"),
		).rejects.toThrow("No slides are available to export.");
		expect(save).not.toHaveBeenCalled();
	});
});
