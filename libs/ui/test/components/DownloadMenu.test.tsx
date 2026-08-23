/// <reference lib="dom" />

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { PresentationData } from "@slidesage/types";
import DownloadMenu, {
	type PresentationExporter,
} from "@slidesage/ui/components/Viewer/DownloadMenu";
import { fireEvent, render, waitFor } from "@testing-library/react";

const exportEditablePptx = mock(async (_presentation: PresentationData) => {});
const exportPresentationPdf = mock(async (_title: string) => {});

const exportPresentation: PresentationExporter = async (format, presentation) => {
	if (format === "pptx") {
		await exportEditablePptx(presentation);
		return;
	}
	await exportPresentationPdf(presentation.title);
};

const presentation: PresentationData = {
	title: "Structured deck",
	theme: "corporate-blue",
	totalSlides: 1,
	slides: [
		{
			id: "presentation-slide",
			type: "content",
			layout: "body",
			title: "Current presentation",
			subtitle: "",
			tone: "default",
			density: "standard",
			pattern: "none",
			blocks: [{ type: "paragraph", region: "main", text: "Current presentation content" }],
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
		const view = render(<DownloadMenu presentation={presentation} onExport={exportPresentation} />);
		openMenu(view.getByRole("button", { name: "Download" }));

		fireEvent.click(view.getByRole("menuitem", { name: "PowerPoint" }));

		await waitFor(() => expect(exportEditablePptx).toHaveBeenCalledWith(presentation));
	});

	it("downloads the rendered presentation as PDF", async () => {
		const view = render(<DownloadMenu presentation={presentation} onExport={exportPresentation} />);
		openMenu(view.getByRole("button", { name: "Download" }));

		fireEvent.click(view.getByRole("menuitem", { name: "PDF document" }));

		await waitFor(() => expect(exportPresentationPdf).toHaveBeenCalledWith(presentation.title));
	});

	it("disables downloads when there are no slides", () => {
		const view = render(
			<DownloadMenu
				presentation={{ ...presentation, slides: [], totalSlides: 0 }}
				onExport={exportPresentation}
			/>,
		);

		expect(view.getByRole("button", { name: "Download" })).toBeDisabled();
	});

	it("ignores a second export while the first export is pending", async () => {
		let finishExport = () => {};
		const pendingExport = new Promise<void>((resolve) => {
			finishExport = resolve;
		});
		const onExport = mock(() => pendingExport);
		const view = render(<DownloadMenu presentation={presentation} onExport={onExport} />);
		openMenu(view.getByRole("button", { name: "Download" }));
		const item = view.getByRole("menuitem", { name: "PowerPoint" });

		fireEvent.click(item);
		fireEvent.click(item);

		expect(onExport).toHaveBeenCalledTimes(1);
		finishExport();
		await waitFor(() => expect(view.getByRole("button", { name: "Download" })).toBeEnabled());
	});

	it("shows a format-specific accessible error", async () => {
		const originalConsoleError = console.error;
		console.error = mock(() => {});
		exportPresentationPdf.mockImplementation(async () => {
			throw new Error("write failed");
		});
		try {
			const view = render(
				<DownloadMenu presentation={presentation} onExport={exportPresentation} />,
			);
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
