/// <reference lib="dom" />

import { beforeEach, describe, expect, it, mock } from "bun:test";

const addPage = mock(() => {});
const addImage = mock(() => {});
const save = mock(() => {});
const html2canvas = mock(async (_element: HTMLElement) => ({
    toDataURL: () => "data:image/jpeg;base64,presentation-slide",
}));

class MockJsPdf {
    addPage = addPage;
    addImage = addImage;
    save = save;
}

mock.module("html2canvas", () => ({ default: html2canvas }));
mock.module("jspdf", () => ({ jsPDF: MockJsPdf }));

const { exportPresentationPdf } = await import("@/lib/pdf-export");

describe("PDF export", () => {
    beforeEach(() => {
        addPage.mockClear();
        addImage.mockClear();
        save.mockClear();
        html2canvas.mockClear();
        document.body.innerHTML = "";
    });

    it("writes each rendered slide to an ordered widescreen PDF page", async () => {
        const carousel = document.createElement("div");
        carousel.className = "slide-carousel";
        carousel.innerHTML = `
            <div data-pdf-slide>First slide</div>
            <div data-pdf-slide>Second slide</div>
        `;
        document.body.append(carousel);

        await exportPresentationPdf("Quarterly: Review?");

        expect(html2canvas).toHaveBeenCalledTimes(2);
        expect(addImage).toHaveBeenCalledTimes(2);
        expect(addPage).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith("Quarterly_ Review_.pdf");
    });

    it("rejects export when no viewer slides are rendered", async () => {
        await expect(exportPresentationPdf("Empty deck")).rejects.toThrow(
            "No rendered slides are available to export.",
        );
        expect(save).not.toHaveBeenCalled();
    });
});
