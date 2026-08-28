import { Switch } from "@slidesage/ui/components/switch";
import { useVimMode } from "@/context/VimModeContext";

export function VimModePreference() {
	const { isVimMode, setVimMode } = useVimMode();

	return (
		<section aria-labelledby="vim-mode-heading">
			<div className="flex items-start justify-between gap-6">
				<div>
					<div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
						Keyboard navigation
					</div>
					<h2 id="vim-mode-heading" className="mt-2 text-lg font-semibold text-white">
						Vim mode
					</h2>
					<p className="mt-2 max-w-xl text-sm leading-6 text-white/60">
						Use familiar Vim keys to move through SlideSage. Typing fields and open dialogs keep
						their normal keyboard behavior.
					</p>
				</div>
				<Switch aria-label="Enable Vim mode" checked={isVimMode} onCheckedChange={setVimMode} />
			</div>
			<dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm text-white/60">
				<dt className="font-mono text-white/85">j / k</dt>
				<dd>Scroll down / up</dd>
				<dt className="font-mono text-white/85">Ctrl-d / Ctrl-u</dt>
				<dd>Half page down / up</dd>
				<dt className="font-mono text-white/85">gg / G</dt>
				<dd>Top / bottom of page</dd>
				<dt className="font-mono text-white/85">[ / ]</dt>
				<dd>Previous / next control</dd>
				<dt className="font-mono text-white/85">gh gn gp gm gr gs</dt>
				<dd>Home, generate, presentations, marketplace, research, settings</dd>
				<dt className="font-mono text-white/85">j / l in a deck</dt>
				<dd>Previous / next slide</dd>
			</dl>
		</section>
	);
}
