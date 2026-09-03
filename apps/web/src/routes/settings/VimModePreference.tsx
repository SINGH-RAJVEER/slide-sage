import { Switch } from "@slidesage/ui/components/switch";
import { useEffect, useState } from "react";
import { useVimMode } from "@/context/VimModeContext";

const MOBILE_VIEWPORT_QUERY = "(max-width: 767px)";

export function VimModePreference() {
	const { isVimMode, setVimMode } = useVimMode();
	const [isMobileViewport, setIsMobileViewport] = useState(
		() => window.matchMedia(MOBILE_VIEWPORT_QUERY).matches,
	);

	useEffect(() => {
		const query = window.matchMedia(MOBILE_VIEWPORT_QUERY);
		const update = () => setIsMobileViewport(query.matches);
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);

	if (isMobileViewport) return null;

	return (
		<section aria-labelledby="vim-mode-heading">
			<div className="flex items-start justify-between gap-6">
				<div className="flex-1">
					<div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
						Keyboard navigation
					</div>
					<h2 id="vim-mode-heading" className="mt-2 text-lg font-semibold text-white">
						Vim mode
					</h2>
					<p className="mt-2 text-sm leading-6 text-white/60">
						Use familiar Vim keys to move through SlideSage. Typing fields and open dialogs keep
						their normal keyboard behavior.
					</p>
				</div>
				<Switch aria-label="Enable Vim mode" checked={isVimMode} onCheckedChange={setVimMode} />
			</div>
			<table className="mt-5 w-full text-left text-sm text-white/60">
				<tbody className="divide-y divide-white/[0.06]">
					<tr>
						<td className="w-48 py-2 pr-4 font-mono whitespace-nowrap text-white/85">j / k</td>
						<td className="w-full py-2">Scroll down / up</td>
					</tr>
					<tr>
						<td className="w-48 py-2 pr-4 font-mono whitespace-nowrap text-white/85">
							Ctrl-d / Ctrl-u
						</td>
						<td className="w-full py-2">Half page down / up</td>
					</tr>
					<tr>
						<td className="w-48 py-2 pr-4 font-mono whitespace-nowrap text-white/85">gg / G</td>
						<td className="w-full py-2">Top / bottom of page</td>
					</tr>
					<tr>
						<td className="w-48 py-2 pr-4 font-mono whitespace-nowrap text-white/85">[ / ]</td>
						<td className="w-full py-2">Previous / next control</td>
					</tr>
					<tr>
						<td className="w-48 py-2 pr-4 font-mono whitespace-nowrap text-white/85">
							gh gn gp gm gr gs
						</td>
						<td className="w-full py-2">
							Home, generate, presentations, marketplace, research, settings
						</td>
					</tr>
					<tr>
						<td className="w-48 py-2 pr-4 font-mono whitespace-nowrap text-white/85">
							j / l in a deck
						</td>
						<td className="w-full py-2">Previous / next slide</td>
					</tr>
				</tbody>
			</table>
		</section>
	);
}
