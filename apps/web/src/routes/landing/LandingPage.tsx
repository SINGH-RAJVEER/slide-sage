import { Button } from "@slidesage/ui/components/button";
import { Link } from "react-router-dom";
import { ROUTES } from "@/app/router/paths";
import { SlideRingHero } from "./SlideRingHero";

export default function LandingPage() {
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

			<section aria-label="SlideSage showcase" className="relative h-[56vh] min-h-[420px] w-full">
				<SlideRingHero />
			</section>

			<section className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
				<h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
					One prompt in. A finished deck out.
				</h1>
				<p className="mt-4 text-pretty text-base leading-relaxed text-white/50">
					SlideSage plans, writes, designs, and exports your presentation. Every plate orbiting
					above is a real theme, drawn from a finished deck.
				</p>
				<div className="mt-8 flex items-center justify-center">
					<Button asChild size="lg" className="bg-white text-neutral-950 hover:bg-white/90">
						<Link to={ROUTES.signUp}>Start generating</Link>
					</Button>
				</div>
			</section>

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
