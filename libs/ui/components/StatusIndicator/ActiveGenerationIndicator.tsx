import { Spinner } from "@slidesage/ui/components/spinner";
import { ChevronRight } from "lucide-react";
import { useContext } from "react";
import { StreamingContext } from "../../context/StreamingContext";

interface ActiveGenerationIndicatorProps {
	/** Hidden on routes where the generation is already visible, e.g. the viewer. */
	hidden?: boolean;
	/** Called when the user follows the indicator back to the running generation. */
	onOpen: (presentationId: string | undefined) => void;
}

/**
 * Persistent pill shown while a presentation generates in the background, so a
 * user who navigated away from the generation view can find their way back.
 * Survives reloads because StreamingProvider resumes the durable job.
 *
 * Renders nothing when no provider is mounted or no generation is running, so
 * hosts can mount it unconditionally.
 */
export function ActiveGenerationIndicator({
	hidden = false,
	onOpen,
}: ActiveGenerationIndicatorProps) {
	const context = useContext(StreamingContext);
	if (hidden || !context?.streamingState.isStreaming) return null;

	const label =
		context.streamingState.prompt?.trim() || context.streamingState.title || "your presentation";

	return (
		<button
			type="button"
			onClick={() => onOpen(context.streamingState.presentationId)}
			aria-label={`Generation in progress: ${label}. Open it`}
			className="flex h-9 min-w-0 items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-3 text-sm text-blue-200 transition-colors hover:border-blue-300/40 hover:bg-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
		>
			<Spinner className="size-3.5 shrink-0" />
			<span className="hidden font-medium sm:inline">Generating</span>
			<span className="max-w-24 truncate md:max-w-44">{label}</span>
			<ChevronRight className="size-3.5 shrink-0 opacity-60" />
		</button>
	);
}
