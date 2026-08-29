import { AlertTriangle, Check } from "lucide-react";
import { useEffect } from "react";

const NOTICE_TTL_MS = 4000;

interface FloatingSettingsNoticeProps {
	/** Error to display; null hides the indicator. */
	error: string | null;
	/** Success message to display; error takes precedence when both are present. */
	success?: string | null;
	onDismiss: () => void;
}

/**
 * Transient status notice pinned below the header's top-right corner,
 * mirroring the active generation indicator's placement and pill styling.
 * Auto-dismisses shortly after appearing.
 */
export function FloatingSettingsNotice({ error, success, onDismiss }: FloatingSettingsNoticeProps) {
	const message = error || success;
	const isError = !!error;

	useEffect(() => {
		if (!message) return undefined;
		const timer = setTimeout(onDismiss, NOTICE_TTL_MS);
		return () => clearTimeout(timer);
	}, [message, onDismiss]);

	if (!message) return null;

	return (
		<div
			role={isError ? "alert" : "status"}
			aria-live="polite"
			className={`fixed top-[4.5rem] right-4 z-50 flex h-12 max-w-[calc(100vw-2rem)] items-center gap-2.5 overflow-hidden rounded-full border bg-[hsl(222,27%,12%)]/95 px-5 text-sm font-medium shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md md:right-6 ${
				isError ? "border-red-400/30 text-red-200" : "border-emerald-400/30 text-emerald-200"
			}`}
		>
			{isError ? (
				<AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
			) : (
				<Check className="size-4 shrink-0" aria-hidden="true" />
			)}
			<span className="truncate">{message}</span>
		</div>
	);
}
