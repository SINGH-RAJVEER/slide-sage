/// <reference lib="dom" />

import { beforeEach, describe, expect, it, mock } from "bun:test";

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
    beforeEach(() => {
        addPage.mockClear();
        addImage.mockClear();
        save.mockClear();
        toJpeg.mockClear();
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

    it("rejects export when no viewer slides are rendered", async () => {
        await expect(exportPresentationPdf("Empty deck")).rejects.toThrow(
            "No rendered slides are available to export.",
        );
        expect(save).not.toHaveBeenCalled();
    });
});
