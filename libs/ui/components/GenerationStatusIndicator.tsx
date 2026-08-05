import { AlertCircle, ArrowUpRight, Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

type GenerationStatus = "active" | "complete" | "error";

interface GenerationStatusIndicatorViewProps {
	status: GenerationStatus;
	title: string;
	detail: string;
	progress?: number;
	autoDismissMs?: number;
	onActivate: () => void;
}

const STATUS_STYLES: Record<GenerationStatus, string> = {
	active:
		"border-sky-300/25 bg-[hsl(222,27%,12%)] text-sky-100 hover:border-sky-200/45 focus-visible:border-sky-200/45",
	complete:
		"border-emerald-300/25 bg-[hsl(222,27%,12%)] text-emerald-100 hover:border-emerald-200/45 focus-visible:border-emerald-200/45",
	error:
		"border-red-300/25 bg-[hsl(222,27%,12%)] text-red-100 hover:border-red-200/45 focus-visible:border-red-200/45",
};

export function GenerationStatusIndicatorView({
	status,
	title,
	detail,
	progress,
	autoDismissMs,
	onActivate,
}: GenerationStatusIndicatorViewProps) {
	const [isVisible, setIsVisible] = useState(true);
	const Icon = status === "active" ? LoaderCircle : status === "complete" ? Check : AlertCircle;
	const normalizedProgress = Math.max(0, Math.min(progress ?? 0, 1));

	useEffect(() => {
		if (autoDismissMs === undefined) return;
		const cooldown = setTimeout(() => setIsVisible(false), autoDismissMs);
		return () => clearTimeout(cooldown);
	}, [autoDismissMs]);

	if (!isVisible) return null;

	return (
		<button
			type="button"
			onClick={onActivate}
			className={`group fixed right-4 top-24 z-50 flex h-10 w-10 max-w-[calc(100vw-2rem)] animate-in items-center overflow-hidden rounded-full border p-0 text-left shadow-2xl transition-[width,border-radius,border-color] duration-200 ease-out fade-in-0 slide-in-from-top-2 hover:w-80 hover:rounded-lg focus-visible:w-80 focus-visible:rounded-lg focus-visible:outline-none sm:right-5 ${STATUS_STYLES[status]}`}
			aria-label={`${title}. ${detail}`}
			aria-live={status === "error" ? "assertive" : "polite"}
		>
			<span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/8">
				<Icon
					className={`h-5 w-5 ${status === "active" ? "animate-spin motion-reduce:animate-none" : ""}`}
					aria-hidden="true"
				/>
			</span>
			<span className="min-w-0 flex-1 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100">
				<span className="block truncate text-sm font-semibold text-white">{title}</span>
				<span
					className={`mt-0.5 block text-xs text-white/60 ${status === "error" ? "break-words" : "truncate"}`}
				>
					{detail}
				</span>
				{status === "active" ? (
					<span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/10">
						<span
							className="block h-full origin-left rounded-full bg-sky-300 transition-transform duration-500 motion-reduce:transition-none"
							style={{ transform: `scaleX(${normalizedProgress})` }}
						/>
					</span>
				) : null}
			</span>
			<ArrowUpRight
				className="mr-3 h-4 w-4 flex-none opacity-0 text-white/45 transition-[color,opacity] group-hover:opacity-100 group-hover:text-white/80 group-focus-visible:opacity-100"
				aria-hidden="true"
			/>
		</button>
	);
}
