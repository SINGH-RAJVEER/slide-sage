import { GalleryHeading } from "@designcodeio/threeui";
import { Button } from "@slidesage/ui/components/button";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "@/app/router/paths";
import { firstPositionOfGallery, galleryAtPosition, LANDING_GALLERIES } from "./landing-galleries";
import { ThemeSlideCarousel } from "./ThemeSlideCarousel";

const SLIDE_INTERVAL_MS = 5200;

function usePrefersReducedMotion() {
	const [reducedMotion, setReducedMotion] = useState(
		() => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
	);

	useEffect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => setReducedMotion(query.matches);
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);

	return reducedMotion;
}

export default function LandingPage() {
	const [position, setPosition] = useState(0);
	const [hovering, setHovering] = useState(false);
	const [autoPlay, setAutoPlay] = useState(true);
	const [documentVisible, setDocumentVisible] = useState(!document.hidden);
	const reducedMotion = usePrefersReducedMotion();

	const playing = autoPlay && !hovering && !reducedMotion && documentVisible;
	const { galleryIndex, slideIndex } = galleryAtPosition(position);
	const gallery = LANDING_GALLERIES[galleryIndex] ?? LANDING_GALLERIES[0];

	if (!gallery) return null;

	useEffect(() => {
		const update = () => setDocumentVisible(!document.hidden);
		document.addEventListener("visibilitychange", update);
		return () => document.removeEventListener("visibilitychange", update);
	}, []);

	useEffect(() => {
		if (!playing) return undefined;
		const timer = setInterval(() => {
			setPosition((current) => current + 1);
		}, SLIDE_INTERVAL_MS);
		return () => clearInterval(timer);
	}, [playing]);

	return (
		<div className="flex min-h-dvh flex-col bg-[hsl(222_27%_12%)] text-white">
			<header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
				<Link
					to={ROUTES.home}
					className="text-lg font-semibold tracking-tight"
					aria-label="SlideSage home"
				>
					SlideSage
				</Link>
				<nav aria-label="Account" className="flex items-center gap-2">
					<Button
						asChild
						variant="ghost"
						className="text-white/70 hover:bg-white/10 hover:text-white"
					>
						<Link to={ROUTES.signIn}>Sign in</Link>
					</Button>
					<Button asChild className="bg-white text-neutral-950 hover:bg-white/90">
						<Link to={ROUTES.signUp}>Get started</Link>
					</Button>
				</nav>
			</header>

			<section aria-label="Theme galleries" className="relative h-[58vh] min-h-[420px] w-full">
				<GalleryHeading variant={gallery.variant} mode="dark" className="absolute inset-0" />
				<p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-4 py-1.5 text-xs tracking-wide text-white/70 backdrop-blur-sm">
					Gallery {galleryIndex + 1} · {gallery.themeName}
				</p>
			</section>

			<section className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
				<h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
					One prompt in. A finished deck out.
				</h1>
				<p className="mt-4 text-pretty text-base leading-relaxed text-white/50">
					SlideSage plans, writes, designs, and exports your presentation. Pick a visual system
					below — every example here was rendered live by the same engine.
				</p>
				<div className="mt-8 flex items-center justify-center gap-3">
					<Button asChild size="lg" className="bg-white text-neutral-950 hover:bg-white/90">
						<Link to={ROUTES.signUp}>Start generating</Link>
					</Button>
					<Button
						asChild
						size="lg"
						variant="outline"
						className="border-white/15 bg-transparent text-white/80 hover:bg-white/10 hover:text-white"
					>
						<a href="#themes">Browse the themes</a>
					</Button>
				</div>
			</section>

			<ThemeSlideCarousel
				galleryIndex={galleryIndex}
				slideIndex={slideIndex}
				position={position}
				playing={playing}
				onHoverChange={setHovering}
				onToggleAutoPlay={() => setAutoPlay((value) => !value)}
				onNext={() => setPosition((current) => current + 1)}
				onPrevious={() => setPosition((current) => current - 1)}
				onSelectGallery={(index) => setPosition(firstPositionOfGallery(index))}
			/>

			<section className="border-t border-white/10 bg-white/[0.02]">
				<div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-20 text-center">
					<h2 className="text-balance text-3xl font-semibold tracking-tight">
						Your next deck is one prompt away
					</h2>
					<p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50">
						Start from a topic, a paper, or nothing at all. SlideSage drafts the story, shapes every
						layout, and hands you the file.
					</p>
					<Button asChild size="lg" className="mt-8 bg-white text-neutral-950 hover:bg-white/90">
						<Link to={ROUTES.signUp}>Create your first deck</Link>
					</Button>
				</div>
			</section>

			<footer className="mt-auto border-t border-white/10">
				<div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 text-xs text-white/40">
					<span>SlideSage</span>
					<span>© 2026 SlideSage</span>
				</div>
			</footer>
		</div>
	);
}
