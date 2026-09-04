import type React from "react";
import { useEffect, useRef } from "react";
import { mountPptxSlide, type PptxDocument } from "../../lib/pptx-document";

interface PptxSlideProps {
	document: PptxDocument;
	index: number;
	className?: string;
}

/**
 * Renders one slide of a parsed revision into a plain container. The renderer
 * owns the DOM it produces, so this component only mounts and disposes it.
 */
export const PptxSlide: React.FC<PptxSlideProps> = ({ document, index, className = "" }) => {
	const containerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		return mountPptxSlide(container, document, index);
	}, [document, index]);

	return (
		<div
			ref={containerRef}
			aria-label={`Slide ${index + 1}`}
			className={`relative overflow-hidden ${className}`}
			style={{ aspectRatio: `${document.width} / ${document.height}` }}
		/>
	);
};
