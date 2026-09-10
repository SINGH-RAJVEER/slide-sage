import type React from "react";
import { useEffect, useRef, useState } from "react";

interface MarqueeTextProps {
	text: string;
	className?: string;
}

/** Pixels of travel per second once a label is too wide for its slot. */
const SCROLL_SPEED = 30;
const MIN_TRAVEL_SECONDS = 3;
/** Share of a cycle spent moving; the rest holds each end of the label still. */
const TRAVEL_FRACTION = 0.76;

/**
 * Shows a single line of text, scrolling it to its end when it does not fit the
 * available width instead of clipping it to an ellipsis, then starting over.
 */
export const MarqueeText: React.FC<MarqueeTextProps> = ({ text, className = "" }) => {
	const viewportRef = useRef<HTMLSpanElement>(null);
	const trackRef = useRef<HTMLSpanElement>(null);
	const [overflow, setOverflow] = useState(0);

	useEffect(() => {
		const viewport = viewportRef.current;
		const track = trackRef.current;
		if (!viewport || !track) return;

		const measure = () => {
			setOverflow(Math.max(0, Math.ceil(track.scrollWidth - viewport.clientWidth)));
		};
		measure();

		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(viewport);
		observer.observe(track);
		return () => observer.disconnect();
	}, [text]);

	const scrolling = overflow > 0;

	return (
		<span ref={viewportRef} className={`block overflow-hidden ${className}`} title={text}>
			<span
				ref={trackRef}
				className={`block w-max whitespace-nowrap ${scrolling ? "ss-marquee-track" : ""}`}
				style={
					scrolling
						? ({
								"--ss-marquee-distance": `-${overflow}px`,
								"--ss-marquee-duration": `${(Math.max(MIN_TRAVEL_SECONDS, overflow / SCROLL_SPEED) / TRAVEL_FRACTION).toFixed(2)}s`,
							} as React.CSSProperties)
						: undefined
				}
			>
				{text}
			</span>
		</span>
	);
};

export default MarqueeText;
