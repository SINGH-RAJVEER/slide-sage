/// <reference lib="dom" />

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { PresentationData } from "@slidesage/types";
import DownloadMenu, {
	type PresentationExporter,
} from "@slidesage/ui/components/Viewer/DownloadMenu";
import { fireEvent, render, waitFor } from "@testing-library/react";

const exportPptx = mock(async (_presentation: PresentationData) => {});

const exportPresentation: PresentationExporter = async (_format, presentation) => {
	await exportPptx(presentation);
};

const presentation: PresentationData = {
	title: "Structured deck",
	template: { id: "simple-business-proposal", version: 1 },
	totalSlides: 1,
	currentRevision: {
		revision: 1,
		slideCount: 1,
		byteSize: 2048,
		sha256: "a".repeat(64),
		previewStatus: "ready",
		previewCount: 1,
		createdAt: "2026-01-01T00:00:00Z",
	},
};

const openMenu = (button: HTMLElement) => {
	fireEvent.pointerDown(button, { button: 0, ctrlKey: false });
};

describe("DownloadMenu", () => {
	beforeEach(() => {
		exportPptx.mockClear();
		exportPptx.mockImplementation(async () => {});
	});

	it("downloads the current presentation as PPTX", async () => {
		const view = render(
			<DownloadMenu presentation={presentation} onExport={exportPresentation} />,
		);
		openMenu(view.getByRole("button", { name: /Download/ }));
		fireEvent.click(await view.findByText("PowerPoint"));

		await waitFor(() => expect(exportPptx).toHaveBeenCalledTimes(1));
		expect(exportPptx.mock.calls[0]?.[0]?.title).toBe("Structured deck");
	});

	// Download serves the bytes of a committed revision, so a deck that has not
	// produced one yet has nothing to hand over.
	it("disables downloads until a revision exists", () => {
		const view = render(
			<DownloadMenu
				presentation={{ ...presentation, currentRevision: undefined }}
				onExport={exportPresentation}
			/>,
		);
		expect(view.getByRole("button", { name: /Download/ })).toBeDisabled();
	});

	it("ignores a second export while the first export is pending", async () => {
		let release: (() => void) | undefined;
		exportPptx.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				}),
		);
		const view = render(
			<DownloadMenu presentation={presentation} onExport={exportPresentation} />,
		);
		openMenu(view.getByRole("button", { name: /Download/ }));
		fireEvent.click(await view.findByText("PowerPoint"));
		await waitFor(() => expect(exportPptx).toHaveBeenCalledTimes(1));

		openMenu(view.getByRole("button", { name: /Exporting/ }));
		expect(exportPptx).toHaveBeenCalledTimes(1);

		release?.();
	});

	it("shows an accessible error when the export fails", async () => {
		exportPptx.mockImplementation(async () => {
			throw new Error("export boom");
		});
		const view = render(
			<DownloadMenu presentation={presentation} onExport={exportPresentation} />,
		);
		openMenu(view.getByRole("button", { name: /Download/ }));
		fireEvent.click(await view.findByText("PowerPoint"));

		const alert = await view.findByRole("alert");
		expect(alert.textContent).toContain("PPTX export failed");
	});
});
