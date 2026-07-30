/// <reference lib="dom" />

import { beforeEach, describe, expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import type { PresentationData } from "@/modules/types/presentation";

const exportEditablePptx = mock(async (_presentation: PresentationData) => {});
const exportPresentationPdf = mock(async (_title: string) => {});

mock.module("@/lib/pptx-export", () => ({ exportEditablePptx }));
mock.module("@/lib/pdf-export", () => ({ exportPresentationPdf }));

const { default: DownloadMenu } = await import("@/components/Viewer/DownloadMenu");

const presentation: PresentationData = {
    title: "Structured deck",
    theme: "corporate-blue",
    totalSlides: 1,
    slides: [
        {
            id: "presentation-slide",
            type: "content",
            html: '<div id="slide-content">Current presentation content</div>',
        },
    ],
};

const openMenu = (button: HTMLElement) => {
    fireEvent.pointerDown(button, { button: 0, ctrlKey: false });
};

describe("DownloadMenu", () => {
    beforeEach(() => {
        exportEditablePptx.mockClear();
        exportPresentationPdf.mockClear();
        exportEditablePptx.mockImplementation(async () => {});
        exportPresentationPdf.mockImplementation(async () => {});
    });

    it("downloads the current presentation as PPTX", async () => {
        const view = render(<DownloadMenu presentation={presentation} />);
        openMenu(view.getByRole("button", { name: "Download" }));

        fireEvent.click(view.getByRole("menuitem", { name: "PowerPoint" }));

        await waitFor(() => expect(exportEditablePptx).toHaveBeenCalledWith(presentation));
    });

    it("downloads the rendered presentation as PDF", async () => {
        const view = render(<DownloadMenu presentation={presentation} />);
        openMenu(view.getByRole("button", { name: "Download" }));

        fireEvent.click(view.getByRole("menuitem", { name: "PDF document" }));

        await waitFor(() => expect(exportPresentationPdf).toHaveBeenCalledWith(presentation.title));
    });

    it("disables downloads when there are no slides", () => {
        const view = render(
            <DownloadMenu presentation={{ ...presentation, slides: [], totalSlides: 0 }} />,
        );

        expect(view.getByRole("button", { name: "Download" })).toBeDisabled();
    });

    it("shows a format-specific accessible error", async () => {
        const originalConsoleError = console.error;
        console.error = mock(() => {});
        exportPresentationPdf.mockImplementation(async () => {
            throw new Error("write failed");
        });
        try {
            const view = render(<DownloadMenu presentation={presentation} />);
            openMenu(view.getByRole("button", { name: "Download" }));
            fireEvent.click(view.getByRole("menuitem", { name: "PDF document" }));

            expect(await view.findByRole("alert")).toHaveTextContent(
                "PDF export failed. Please try again.",
            );
            expect(view.getByRole("button", { name: "Download" })).toBeEnabled();
        } finally {
            console.error = originalConsoleError;
        }
    });
});
