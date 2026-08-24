/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import type { ContentSlide, PresentationData } from "@slidesage/types";
import { ViewerNavigationControls } from "@slidesage/ui/components/Viewer/ViewerNavigationControls";
import { ViewerSlideCarousel } from "@slidesage/ui/components/Viewer/ViewerSlideCarousel";
import { fireEvent, render } from "@testing-library/react";
import { createRef } from "react";

const emptyPresentation: PresentationData = {
	title: "Generating presentation",
	theme: "corporate-blue",
	slides: [],
	totalSlides: 0,
};

it("renders a blank loading slide before the first streamed slide", () => {
	const view = render(
		<ViewerSlideCarousel
			slides={[]}
			currentSlide={0}
			visibleSlide={0}
			currentTemplate="corporate-blue"
			containerRef={createRef<HTMLDivElement>()}
			onSelectSlide={mock()}
			isWaitingForFirstSlide={true}
		/>,
	);

	expect(
		view.getByRole("option", { name: "Waiting for the first generated slide" }),
	).toBeInTheDocument();
	expect(view.getByRole("img", { name: "Loading" })).toBeInTheDocument();
});

it("keeps empty-presentation controls visible and disabled", () => {
	const onSave = mock();
	const view = render(
		<ViewerNavigationControls
			presentation={emptyPresentation}
			currentSlide={0}
			totalSlides={0}
			onFirst={mock()}
			onPrev={mock()}
			onNext={mock()}
			onLast={mock()}
			onDelete={mock()}
			deleteDisabled={true}
			onSave={onSave}
		/>,
	);

	expect(view.getByRole("button", { name: "Download" })).toBeDisabled();
	expect(view.getByRole("button", { name: "Previous slide" })).toBeDisabled();
	expect(view.getByRole("button", { name: "Next slide" })).toBeDisabled();
	expect(view.getByRole("button", { name: "Delete" })).toBeDisabled();
	fireEvent.click(view.getByRole("button", { name: "Save" }));
	expect(onSave).toHaveBeenCalledTimes(1);
});

it("replaces the disabled delete action with cancellation while generation is pending", () => {
	const onCancelGeneration = mock();
	const view = render(
		<ViewerNavigationControls
			presentation={emptyPresentation}
			currentSlide={0}
			totalSlides={0}
			onFirst={mock()}
			onPrev={mock()}
			onNext={mock()}
			onLast={mock()}
			onDelete={mock()}
			deleteDisabled={true}
			onCancelGeneration={onCancelGeneration}
		/>,
	);

	expect(view.queryByRole("button", { name: "Delete" })).toBeNull();
	fireEvent.click(view.getByRole("button", { name: "Cancel generation" }));
	expect(onCancelGeneration).toHaveBeenCalledTimes(1);
});

it("keeps content slides on their canonical renderer while editing", () => {
	const slide: ContentSlide = {
		id: "content-1",
		type: "content",
		layout: "body",
		title: "Editable title",
		subtitle: "",
		tone: "default",
		density: "standard",
		pattern: "none",
		blocks: [
			{
				id: "content-1-block-1",
				type: "paragraph",
				region: "main",
				text: "Editable paragraph",
			},
		],
	};
	const view = render(
		<ViewerSlideCarousel
			slides={[slide]}
			currentSlide={0}
			visibleSlide={0}
			currentTemplate="corporate-blue"
			containerRef={createRef<HTMLDivElement>()}
			onSelectSlide={mock()}
			onSlideChange={mock()}
		/>,
	);

	expect(view.container.querySelector('[data-layout="body"]')).toBeInTheDocument();
	expect(view.container.querySelector("[data-scene-node-id]")).toBeNull();
	expect(view.getByText("Editable title")).toBeInTheDocument();
	expect(view.getByText("Editable paragraph")).toBeInTheDocument();
});
