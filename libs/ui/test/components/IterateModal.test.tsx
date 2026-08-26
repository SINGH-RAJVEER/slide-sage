/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import IterateModal from "@slidesage/ui/components/Viewer/IterateModal";
import { fireEvent, render } from "@testing-library/react";

it("renders a single accessible form only while open", () => {
	const onOpenChange = mock(() => {});
	const view = render(
		<IterateModal open={true} onOpenChange={onOpenChange} onIterate={mock()} isStreaming={false} />,
	);

	expect(view.getAllByRole("textbox")).toHaveLength(1);
	expect(document.querySelectorAll("#iteratePrompt")).toHaveLength(1);
	fireEvent.click(view.getByRole("button", { name: "Close iterate sidebar" }));
	expect(onOpenChange).toHaveBeenCalledWith(false);

	view.unmount();
	const closedView = render(
		<IterateModal open={false} onOpenChange={mock()} onIterate={mock()} isStreaming={false} />,
	);
	const closedPanel = closedView.getByLabelText("Iterate on presentation");
	expect(closedPanel).toHaveClass("viewer-iterate-panel--closed");
	expect(closedPanel).toHaveAttribute("aria-hidden", "true");
});

it("submits the selected generation settings including the slide count", () => {
	const onIterate = mock(() => {});
	const view = render(
		<IterateModal open={true} onOpenChange={mock()} onIterate={onIterate} isStreaming={false} />,
	);

	fireEvent.input(view.getByRole("textbox"), { target: { value: "Strengthen the evidence" } });
	fireEvent.click(view.getByRole("button", { name: "Detailed" }));
	fireEvent.click(view.getByRole("button", { name: "Casual" }));
	fireEvent.click(view.getByRole("button", { name: "Web Research" }));
	const count = view.getByRole("slider", { name: "Slide count" });
	expect(count).toHaveTextContent("5");
	fireEvent.keyDown(count, { key: "ArrowRight" });
	fireEvent.keyDown(count, { key: "ArrowRight" });
	expect(count).toHaveTextContent("7");
	fireEvent.click(view.getByRole("button", { name: "Generate revision" }));

	expect(onIterate).toHaveBeenCalledWith("Strengthen the evidence", 7, "detailed", "casual", true);
	expect(view.getByRole("textbox")).toHaveValue("");
});

it("submits on Enter but preserves Shift+Enter for multiline prompts", () => {
	const onIterate = mock(() => {});
	const view = render(
		<IterateModal open={true} onOpenChange={mock()} onIterate={onIterate} isStreaming={false} />,
	);
	const prompt = view.getByRole("textbox");
	fireEvent.input(prompt, { target: { value: "Add a conclusion" } });

	fireEvent.keyDown(prompt, { key: "Enter", shiftKey: true });
	expect(onIterate).not.toHaveBeenCalled();
	fireEvent.keyDown(prompt, { key: "Enter" });
	expect(onIterate).toHaveBeenCalledTimes(1);
});
