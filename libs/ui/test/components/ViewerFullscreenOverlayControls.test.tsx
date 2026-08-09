/// <reference lib="dom" />

import { expect, it, mock } from "bun:test";
import { ViewerFullscreenOverlayControls } from "@slidesage/ui/components/Viewer/ViewerFullscreenOverlayControls";
import { render } from "@testing-library/react";
import { createRef } from "react";

it("keeps fullscreen navigation and exit controls available in the mobile rail", () => {
	const view = render(
		<ViewerFullscreenOverlayControls
			showControls={true}
			intervalMode="preset"
			slideInterval={5}
			customInterval="5"
			customInputRef={createRef<HTMLInputElement>()}
			setIntervalMode={mock()}
			setSlideInterval={mock()}
			setCustomInterval={mock()}
			isPlaying={false}
			onTogglePlayback={mock()}
			playbackDisabled={false}
			currentSlide={1}
			totalSlides={3}
			onFirst={mock()}
			onPrev={mock()}
			onNext={mock()}
			onLast={mock()}
			onExit={mock()}
			onMouseEnter={mock()}
		/>,
	);

	for (const name of [
		"First slide",
		"Previous slide",
		"Next slide",
		"Last slide",
		"Exit presentation",
	]) {
		expect(view.getByRole("button", { name })).toHaveClass("size-11");
	}
});
