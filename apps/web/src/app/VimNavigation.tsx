import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ROUTES } from "@/app/router/paths";
import { useVimMode } from "@/context/VimModeContext";

const PREFIX_TIMEOUT_MS = 750;
const FOCUSABLE_SELECTOR = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex='-1'])",
].join(", ");

const GO_ROUTES: Record<string, string> = {
	h: ROUTES.home,
	n: ROUTES.generate,
	p: ROUTES.presentations,
	m: ROUTES.marketplace,
	r: ROUTES.research,
	s: ROUTES.settings,
};

function isTypingTarget(target: EventTarget | null) {
	return (
		target instanceof HTMLElement &&
		(target.matches("input, textarea, select") || target.isContentEditable)
	);
}

function moveFocus(direction: 1 | -1) {
	const focusable = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
		(element) => !element.hasAttribute("hidden") && element.getClientRects().length > 0,
	);
	const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
	const nextIndex =
		currentIndex === -1
			? direction === 1
				? 0
				: focusable.length - 1
			: (currentIndex + direction + focusable.length) % focusable.length;
	focusable[nextIndex]?.focus();
}

export default function VimNavigation() {
	const { isVimMode } = useVimMode();
	const location = useLocation();
	const navigate = useNavigate();
	const prefixAt = useRef<number | null>(null);

	useEffect(() => {
		if (!isVimMode) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.altKey || event.metaKey || isTypingTarget(event.target))
				return;
			if (
				document.querySelector(
					"[role='dialog']:not([aria-hidden='true']), .viewer-iterate-panel[aria-hidden='false']",
				)
			)
				return;
			if (
				location.pathname === ROUTES.presentation ||
				location.pathname.startsWith("/presentations/") ||
				location.pathname.endsWith("/preview")
			)
				return;

			const key = event.key;
			if (event.ctrlKey) {
				if (key !== "d" && key !== "u") return;
				event.preventDefault();
				window.scrollBy({ top: key === "d" ? window.innerHeight / 2 : -window.innerHeight / 2 });
				return;
			}
			const now = Date.now();
			const hasPrefix = prefixAt.current !== null && now - prefixAt.current < PREFIX_TIMEOUT_MS;
			if (hasPrefix && GO_ROUTES[key]) {
				event.preventDefault();
				prefixAt.current = null;
				navigate(GO_ROUTES[key]);
				return;
			}
			prefixAt.current = null;

			if (key === "g") {
				if (hasPrefix) {
					event.preventDefault();
					window.scrollTo({ top: 0, behavior: "smooth" });
					return;
				}
				prefixAt.current = now;
				return;
			}
			if (key === "G") {
				event.preventDefault();
				window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
				return;
			}
			if (key === "j" || key === "k") {
				event.preventDefault();
				window.scrollBy({ top: key === "j" ? 96 : -96, behavior: "smooth" });
				return;
			}
			if (key === "]" || key === "[") {
				event.preventDefault();
				moveFocus(key === "]" ? 1 : -1);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isVimMode, location.pathname, navigate]);

	return null;
}
