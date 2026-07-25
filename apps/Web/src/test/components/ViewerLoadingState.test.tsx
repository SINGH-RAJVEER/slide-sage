/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { render } from "@testing-library/react";
import { createRef } from "react";
import { ViewerNavigationControls } from "@/components/Viewer/ViewerNavigationControls";
import { ViewerSlideCarousel } from "@/components/Viewer/ViewerSlideCarousel";
import type { PresentationData } from "@/modules/types/presentation";

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
    expect(view.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(view.getByText("Generating your presentation")).toBeInTheDocument();
});

it("keeps empty-presentation controls visible and disabled", () => {
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
        />,
    );

    expect(view.getByRole("button", { name: "Download" })).toBeDisabled();
    expect(view.getByRole("button", { name: "Previous slide" })).toBeDisabled();
    expect(view.getByRole("button", { name: "Next slide" })).toBeDisabled();
    expect(view.getByRole("button", { name: "Delete" })).toBeDisabled();
});
