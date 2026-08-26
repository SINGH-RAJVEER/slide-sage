/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { GenerateForm } from "@slidesage/ui/components/Generate/GenerateForm";
import { fireEvent, render } from "@testing-library/react";

function renderGenerateForm(overrides: Partial<React.ComponentProps<typeof GenerateForm>> = {}) {
	const props: React.ComponentProps<typeof GenerateForm> = {
		prompt: "",
		loading: false,
		onPromptChange: mock(),
		onGenerate: mock(),
		...overrides,
	};

	return {
		props,
		...render(<GenerateForm {...props} />),
	};
}

function makePromptOverflow(textarea: HTMLElement) {
	Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 240 });
	Object.defineProperty(textarea, "clientHeight", { configurable: true, value: 192 });
}

describe("GenerateForm", () => {
	it("renders one prompt editor and keeps expansion unavailable until content overflows", () => {
		const view = renderGenerateForm();

		expect(view.getAllByRole("textbox", { name: "Prompt" })).toHaveLength(1);
		expect(view.queryByRole("button", { name: "Expand prompt editor" })).toBeNull();
	});

	it("enables generation only for a non-empty prompt", () => {
		const onGenerate = mock();
		const view = renderGenerateForm({ prompt: "   ", onGenerate });

		expect(view.getByRole("button", { name: "Generate" })).toBeDisabled();

		view.rerender(
			<GenerateForm
				prompt="Investor pitch with pricing, positioning, and risks"
				loading={false}
				onPromptChange={mock()}
				onGenerate={onGenerate}
			/>,
		);

		const generateButton = view.getByRole("button", { name: "Generate" });
		expect(generateButton).not.toBeDisabled();
		fireEvent.click(generateButton);
		expect(onGenerate).toHaveBeenCalledTimes(1);
	});

	it("shows a loading state while generation is in progress", () => {
		const view = renderGenerateForm({
			prompt: "Quarterly OKR planning",
			loading: true,
		});

		expect(view.getByText("Creating...")).toBeInTheDocument();
		expect(view.getByText("Creating...").closest("button")).toBeDisabled();
	});

	it("generates on Enter in the compact editor", () => {
		const onGenerate = mock();
		const view = renderGenerateForm({
			prompt: "Customer retention strategy",
			onGenerate,
		});

		fireEvent.keyDown(view.getByRole("textbox", { name: "Prompt" }), {
			key: "Enter",
		});

		expect(onGenerate).toHaveBeenCalledTimes(1);
	});

	it("uses Enter for new lines and Shift+Enter to generate when expanded", () => {
		const onGenerate = mock();
		const view = renderGenerateForm({
			prompt: "Customer retention strategy",
			onGenerate,
		});
		const compactEditor = view.getByRole("textbox", { name: "Prompt" });
		const compactGenerateButton = view.getByRole("button", { name: "Generate" });
		makePromptOverflow(compactEditor);
		view.rerender(
			<GenerateForm
				prompt={"Customer retention strategy\nWith a detailed regional breakdown"}
				loading={false}
				onPromptChange={mock()}
				onGenerate={onGenerate}
			/>,
		);

		fireEvent.click(view.getByRole("button", { name: "Expand prompt editor" }));
		const expandedEditor = view.getByRole("textbox", { name: "Prompt" });

		expect(expandedEditor).toBe(compactEditor);
		expect(view.getByRole("button", { name: "Generate" })).toBe(compactGenerateButton);
		expect(view.getByRole("group", { name: "Expanded prompt" })).toBeVisible();

		fireEvent.keyDown(expandedEditor, { key: "Enter" });
		expect(onGenerate).not.toHaveBeenCalled();

		fireEvent.keyDown(expandedEditor, { key: "Enter", shiftKey: true });
		expect(onGenerate).toHaveBeenCalledTimes(1);

		fireEvent.click(view.getByRole("button", { name: "Shrink prompt editor" }));
		expect(view.queryByRole("group", { name: "Expanded prompt" })).toBeNull();
		expect(view.getByRole("textbox", { name: "Prompt" })).toBe(compactEditor);
	});
});
