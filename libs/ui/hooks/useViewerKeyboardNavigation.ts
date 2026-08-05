import { useEffect, useEffectEvent, useRef } from "react";
import { startKeyboardNavigationRepeat } from "./useSlideNavigation";

export function getViewerKeyboardDestination(
	key: string,
	currentSlide: number,
	slideCount: number,
) {
	if (key === "ArrowLeft" || key.toLowerCase() === "j") {
		return Math.max(currentSlide - 1, 0);
	}
	if (key === "ArrowRight" || key.toLowerCase() === "l") {
		return Math.min(currentSlide + 1, slideCount - 1);
	}
	if (key === "ArrowUp") return 0;
	if (key === "ArrowDown") return slideCount - 1;
	return undefined;
}

export function useViewerKeyboardNavigation({
	currentSlide,
	slideCount,
	onNavigate,
	onStopPlayback,
}: {
	currentSlide: number;
	slideCount: number;
	onNavigate: (index: number) => void;
	onStopPlayback: () => void;
}) {
	const keyboardSlideRef = useRef(currentSlide);
	const activeKeyRef = useRef<string | null>(null);
	const stopRepeatRef = useRef<(() => void) | null>(null);
	const navigate = useEffectEvent(onNavigate);
	const stopPlayback = useEffectEvent(onStopPlayback);

	useEffect(() => {
		keyboardSlideRef.current = currentSlide;
	}, [currentSlide]);

	useEffect(() => {
		const stopRepeating = () => {
			stopRepeatRef.current?.();
			stopRepeatRef.current = null;
			activeKeyRef.current = null;
		};
		const navigateForKey = (key: string) => {
			const nextIndex = getViewerKeyboardDestination(key, keyboardSlideRef.current, slideCount);
			if (nextIndex === undefined || nextIndex === keyboardSlideRef.current) return;
			keyboardSlideRef.current = nextIndex;
			navigate(nextIndex);
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (slideCount <= 0) return;
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.matches("input, textarea, select") || target.isContentEditable)
			) {
				return;
			}

			const nextIndex = getViewerKeyboardDestination(
				event.key,
				keyboardSlideRef.current,
				slideCount,
			);

			if (nextIndex === undefined) return;
			event.preventDefault();
			if (event.repeat || activeKeyRef.current === event.key) return;
			stopRepeating();
			stopPlayback();
			keyboardSlideRef.current = nextIndex;
			navigate(nextIndex);
			if (["arrowleft", "arrowright", "j", "l"].includes(event.key.toLowerCase())) {
				activeKeyRef.current = event.key.toLowerCase();
				stopRepeatRef.current = startKeyboardNavigationRepeat(() => navigateForKey(event.key));
			}
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			if (activeKeyRef.current === event.key.toLowerCase()) stopRepeating();
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		window.addEventListener("blur", stopRepeating);
		return () => {
			stopRepeating();
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
			window.removeEventListener("blur", stopRepeating);
		};
	}, [slideCount]);
}
