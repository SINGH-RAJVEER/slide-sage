import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

const NOTICE_TTL_MS = 4000;

interface FloatingSettingsNoticeProps {
	/** Error to display; null hides the indicator. */
	error: string | null;
	onDismiss: () => void;
}

/**
 * Transient failure notice pinned below the header's top-right corner,
 * mirroring the active generation indicator's placement and pill styling.
 * Successful setting changes stay silent; auto-dismisses shortly after
 * appearing.
 */
export function FloatingSettingsNotice({ error, onDismiss }: FloatingSettingsNoticeProps) {
	useEffect(() => {
		if (!error) return undefined;
		const timer = setTimeout(onDismiss, NOTICE_TTL_MS);
		return () => clearTimeout(timer);
	}, [error, onDismiss]);

	if (!error) return null;

	return (
		<div
			role="alert"
			aria-live="polite"
			className="fixed top-[4.5rem] right-4 z-50 flex h-12 max-w-[calc(100vw-2rem)] items-center gap-2.5 overflow-hidden rounded-full border border-red-400/30 bg-[hsl(222,27%,12%)]/95 px-5 text-sm font-medium text-red-200 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md md:right-6"
		>
			<AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
			<span className="truncate">{error}</span>
		</div>
	);
}
