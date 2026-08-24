import { Button } from "@slidesage/ui/components/button";
import { ScaledSlide } from "@slidesage/ui/components/Viewer/ScaledSlide";
import { SlideRenderer } from "@slidesage/ui/components/Viewer/SlideRenderer";
import { cn } from "@slidesage/ui/lib/utils";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { LANDING_GALLERIES, LANDING_SLIDE_COUNT } from "./landing-galleries";

interface FadingSlideProps {
	slideKey: string;
	children: ReactNode;
}

/* Remounts its child per slide and fades it in, so each example settles
   gently instead of snapping when the carousel advances. */
function FadingSlide({ slideKey, children }: FadingSlideProps) {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		setVisible(false);
		const frame = requestAnimationFrame(() => setVisible(true));
		return () => cancelAnimationFrame(frame);
	}, [slideKey]);

	return (
		<div
			className={cn(
				"absolute inset-0 h-full w-full transition-opacity duration-500 ease-out",
				visible ? "opacity-100" : "opacity-0",
			)}
		>
			{children}
		</div>
	);
}

interface ThemeSlideCarouselProps {
	galleryIndex: number;
	slideIndex: number;
	position: number;
	/* Effective autoplay state: the user preference AND no pointer over the stage. */
	playing: boolean;
	onHoverChange: (hovering: boolean) => void;
	onToggleAutoPlay: () => void;
	onNext: () => void;
	onPrevious: () => void;
	onSelectGallery: (galleryIndex: number) => void;
}

export function ThemeSlideCarousel({
	galleryIndex,
	slideIndex,
	position,
	playing,
	onHoverChange,
	onToggleAutoPlay,
	onNext,
	onPrevious,
	onSelectGallery,
}: ThemeSlideCarouselProps) {
	const gallery = LANDING_GALLERIES[galleryIndex] ?? LANDING_GALLERIES[0];
	const slide = gallery?.slides[slideIndex] ?? gallery?.slides[0];
	if (!gallery || !slide) return null;
	const slideKey = `${gallery.id}:${slide.id}`;

	return (
		<section
			aria-label="Theme showcase"
			className="mx-auto w-full max-w-6xl px-6 pb-24"
			onPointerEnter={() => onHoverChange(true)}
			onPointerLeave={() => onHoverChange(false)}
			onFocus={() => onHoverChange(true)}
			onBlur={() => onHoverChange(false)}
		>
			<div className="mb-5 flex flex-wrap items-end justify-between gap-3">
				<div>
					<p className="text-xs font-medium tracking-[0.2em] text-white/40 uppercase">
						Theme {String(galleryIndex + 1).padStart(2, "0")} of {LANDING_GALLERIES.length}
					</p>
					<h2 className="mt-1 text-2xl font-semibold text-white">{gallery.themeName}</h2>
					<p className="mt-1 max-w-xl text-sm text-white/50">{gallery.description}</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="icon"
						aria-label="Previous slide"
						onClick={onPrevious}
						className="border-white/15 bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
					>
						<ChevronLeft />
					</Button>
					<Button
						variant="outline"
						size="icon"
						aria-label={playing ? "Pause the carousel" : "Play the carousel"}
						onClick={onToggleAutoPlay}
						className="border-white/15 bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
					>
						{playing ? <Pause /> : <Play />}
					</Button>
					<Button
						variant="outline"
						size="icon"
						aria-label="Next slide"
						onClick={onNext}
						className="border-white/15 bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
					>
						<ChevronRight />
					</Button>
				</div>
			</div>

			<div
				className="relative aspect-video w-full overflow-hidden rounded-lg ring-1 ring-white/10"
				style={{ backgroundColor: "#0b0d13" }}
			>
				<FadingSlide slideKey={slideKey}>
					<ScaledSlide>
						<SlideRenderer slide={slide} currentTemplate={gallery.themeId} isActive />
					</ScaledSlide>
				</FadingSlide>
			</div>

			<p className="mt-4 text-center text-sm text-white/40">
				Sample deck rendered live by the same engine that builds your slides
			</p>

			<div
				className="mt-5 flex flex-wrap items-center justify-center gap-2"
				role="tablist"
				aria-label="Themes"
			>
				{LANDING_GALLERIES.map((candidate, index) => (
					<button
						key={candidate.id}
						type="button"
						role="tab"
						aria-selected={index === galleryIndex}
						onClick={() => onSelectGallery(index)}
						className={cn(
							"rounded-full px-4 py-1.5 text-xs font-medium tracking-wide transition-colors",
							index === galleryIndex
								? "bg-white text-neutral-950"
								: "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white",
						)}
					>
						{candidate.themeName}
					</button>
				))}
			</div>
			<p className="sr-only" aria-live="polite">
				Slide {position + 1} of {LANDING_SLIDE_COUNT}: {gallery.themeName}, {slide.title}
			</p>
		</section>
	);
}
