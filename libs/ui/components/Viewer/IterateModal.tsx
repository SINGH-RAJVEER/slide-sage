import { Button } from "@slidesage/ui/components/button";
import { DialogHeader } from "@slidesage/ui/components/dialog";
import { Spinner } from "@slidesage/ui/components/spinner";
import { Textarea } from "@slidesage/ui/components/textarea";
import { Globe, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface IterateModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onIterate: (
		prompt: string,
		slideCount: number,
		detailLevel: string,
		tonality: string,
		useWebResearch: boolean,
	) => void;
	isStreaming: boolean;
}

const panelClassName =
	"flex h-dvh w-full flex-col gap-0 overflow-hidden border-l border-white/10 bg-[hsl(222_27%_12%)] bg-[radial-gradient(circle_at_top,hsl(220_20%_18%),hsl(222_27%_12%)_60%)] text-white shadow-2xl sm:w-[28rem]";
const detailLevels = ["brief", "concise", "balanced", "detailed", "comprehensive"];
const tonalities = ["professional", "casual", "enthusiastic", "persuasive"];
const optionClassName =
	"rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export default function IterateModal({
	open,
	onOpenChange,
	onIterate,
	isStreaming,
}: IterateModalProps) {
	const [iteratePrompt, setIteratePrompt] = useState("");
	const [slideCount, setSlideCount] = useState("5");
	const [slideCountMode, setSlideCountMode] = useState("preset");
	const [customSlideCount, setCustomSlideCount] = useState("5");
	const [detailLevel, setDetailLevel] = useState("balanced");
	const [tonality, setTonality] = useState("professional");
	const [useWebResearch, setUseWebResearch] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		if (!open) return;
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") onOpenChange(false);
		};
		window.addEventListener("keydown", closeOnEscape);
		return () => window.removeEventListener("keydown", closeOnEscape);
	}, [onOpenChange, open]);

	const handlePromptChange = (value: string) => {
		setIteratePrompt(value);
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		const maxHeight = 320;
		const nextHeight = Math.min(el.scrollHeight, maxHeight);
		el.style.height = `${nextHeight}px`;
		el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
	};

	const handleSubmit = () => {
		if (iteratePrompt.trim()) {
			const selectedCount =
				slideCountMode === "preset" ? parseInt(slideCount, 10) : parseInt(customSlideCount, 10);
			const count = Math.min(40, Math.max(1, selectedCount || 1));
			onIterate(iteratePrompt, count, detailLevel, tonality, useWebResearch);
			setIteratePrompt("");
		}
	};

	const panelContent = (
		<>
			<DialogHeader className="relative space-y-2 border-b border-white/10 px-5 py-4 pr-16 text-left sm:px-6 sm:py-5">
				<button
					type="button"
					onClick={() => onOpenChange(false)}
					className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white sm:right-4 sm:top-4"
					aria-label="Close iterate sidebar"
				>
					<X className="size-4" />
				</button>
				<h2 className="text-xl font-medium tracking-tight text-white">Iterate on presentation</h2>
			</DialogHeader>
			<div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 py-6">
				<div className="space-y-3">
					<Textarea
						id="iteratePrompt"
						ref={textareaRef}
						placeholder="e.g., 'Add more details to slide 3', 'Make it more casual', 'Add charts'"
						value={iteratePrompt}
						onChange={(e) => handlePromptChange(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey && iteratePrompt.trim()) {
								e.preventDefault();
								handleSubmit();
							}
						}}
						className="min-h-40 resize-none rounded-lg border-white/10 bg-black/20 p-4 text-base leading-6 text-white placeholder:text-white/35 focus-visible:border-white/25 focus-visible:ring-0"
						disabled={isStreaming}
					/>
					<p className="text-xs leading-5 text-white/35">
						Press Enter to generate. Use Shift + Enter for a new line.
					</p>
				</div>

				<div className="border-t border-white/10 pt-6">
					<p className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-white/45">
						Generation settings
					</p>
					<div className="grid gap-6">
						<div className="space-y-3">
							<p className="text-sm font-medium text-white/60">Web research</p>
							<Button
								type="button"
								variant="ghost"
								disabled={isStreaming}
								aria-pressed={useWebResearch}
								onClick={() => setUseWebResearch((prev) => !prev)}
								className={`h-10 w-full justify-center rounded-lg border px-4 transition-colors ${
									useWebResearch
										? "border-white/20 bg-white/10 text-white"
										: "border-transparent bg-transparent text-white/60 hover:bg-white/5 hover:text-white"
								}`}
							>
								<span className="flex items-center gap-2">
									<Globe className="h-4 w-4" />
									{useWebResearch ? "On" : "Off"}
								</span>
							</Button>
						</div>
						<div className="space-y-3">
							<p className="text-sm font-medium text-white/60">Detail level</p>
							<div className="grid grid-cols-2 gap-2">
								{detailLevels.map((level) => (
									<button
										key={level}
										type="button"
										disabled={isStreaming}
										aria-pressed={detailLevel === level}
										onClick={() => setDetailLevel(level)}
										className={`${optionClassName} ${
											detailLevel === level
												? "border-white/20 bg-white/10 text-white"
												: "border-white/5 bg-black/10 text-white/55 hover:border-white/10 hover:bg-white/5 hover:text-white/80"
										}`}
									>
										{level.charAt(0).toUpperCase() + level.slice(1)}
									</button>
								))}
							</div>
						</div>

						<div className="space-y-3">
							<p className="text-sm font-medium text-white/60">Tone</p>
							<div className="grid grid-cols-2 gap-2">
								{tonalities.map((tone) => (
									<button
										key={tone}
										type="button"
										disabled={isStreaming}
										aria-pressed={tonality === tone}
										onClick={() => setTonality(tone)}
										className={`${optionClassName} ${
											tonality === tone
												? "border-white/20 bg-white/10 text-white"
												: "border-white/5 bg-black/10 text-white/55 hover:border-white/10 hover:bg-white/5 hover:text-white/80"
										}`}
									>
										{tone.charAt(0).toUpperCase() + tone.slice(1)}
									</button>
								))}
							</div>
						</div>

						<div className="space-y-3">
							<div className="flex items-center justify-between gap-4">
								<p className="text-sm font-medium text-white/60">Slide count</p>
								<span className="text-sm tabular-nums text-white">
									{slideCountMode === "custom" ? customSlideCount || "1" : slideCount} slides
								</span>
							</div>
							<div className="flex rounded-lg border border-white/10 bg-black/20 p-1">
								<button
									type="button"
									disabled={isStreaming}
									onClick={() => setSlideCountMode("preset")}
									className={`flex-1 rounded-md px-3 py-1.5 text-xs transition-colors ${slideCountMode === "preset" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/75"}`}
								>
									Slider
								</button>
								<button
									type="button"
									disabled={isStreaming}
									onClick={() => setSlideCountMode("custom")}
									className={`flex-1 rounded-md px-3 py-1.5 text-xs transition-colors ${slideCountMode === "custom" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/75"}`}
								>
									Custom
								</button>
							</div>
							{slideCountMode === "preset" ? (
								<div className="space-y-2">
									<input
										type="range"
										min={1}
										max={40}
										step={1}
										value={slideCount}
										disabled={isStreaming}
										aria-label="Slide count"
										onChange={(event) => {
											setSlideCount(event.target.value);
											setCustomSlideCount(event.target.value);
										}}
										className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-white disabled:cursor-not-allowed disabled:opacity-50"
									/>
									<div className="flex justify-between text-[11px] tabular-nums text-white/30">
										<span>1</span>
										<span>20</span>
										<span>40</span>
									</div>
								</div>
							) : (
								<label className="grid gap-2 text-xs text-white/45">
									Number of slides
									<input
										type="number"
										min={1}
										max={40}
										value={customSlideCount}
										onChange={(event) => {
											const value = event.target.value;
											if (/^\d{0,2}$/.test(value) && Number(value) <= 40) {
												setCustomSlideCount(value);
											}
										}}
										onBlur={() => {
											const value = Math.min(
												40,
												Math.max(1, Number(customSlideCount) || 1),
											).toString();
											setCustomSlideCount(value);
											setSlideCount(value);
										}}
										disabled={isStreaming}
										className="hide-number-spin h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25 disabled:cursor-not-allowed disabled:opacity-50"
										inputMode="numeric"
									/>
								</label>
							)}
						</div>
					</div>
				</div>
			</div>
			<div className="border-t border-white/10 bg-black/20 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-6">
				<Button
					onClick={handleSubmit}
					disabled={!iteratePrompt.trim() || isStreaming}
					className="h-11 w-full rounded-md border border-white/20 bg-white/10 font-medium text-white transition-colors hover:bg-white/15"
				>
					{isStreaming ? (
						<>
							<Spinner className="mr-2 size-4" />
							Generating...
						</>
					) : (
						<>
							<Sparkles className="mr-2 size-4" />
							Generate revision
						</>
					)}
				</Button>
			</div>
		</>
	);

	if (!open) return null;

	return (
		<>
			<button
				type="button"
				className="fixed inset-0 z-40 bg-black/45 xl:hidden"
				onClick={() => onOpenChange(false)}
				aria-label="Dismiss iterate panel"
			/>
			<aside
				className={`${panelClassName} fixed inset-y-0 right-0 z-50 max-w-full xl:static xl:z-auto xl:shrink-0`}
				aria-label="Iterate on presentation"
			>
				{panelContent}
			</aside>
		</>
	);
}
