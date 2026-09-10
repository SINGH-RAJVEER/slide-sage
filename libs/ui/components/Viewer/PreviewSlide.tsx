import type { PreviewDocument } from "../../hooks/useRevisionPreviews";
export function PreviewSlide({
	document,
	index,
	className = "",
}: {
	document: PreviewDocument;
	index: number;
	className?: string;
}) {
	return (
		<img
			src={document.slides[index]}
			alt={`Slide ${index + 1}`}
			className={`h-full object-contain ${className}`}
			loading="lazy"
			crossOrigin="use-credentials"
		/>
	);
}
