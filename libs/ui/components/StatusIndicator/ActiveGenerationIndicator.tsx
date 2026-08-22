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

const HEADER_CLEARANCE = "top-[4.5rem] md:top-[5.75rem]";

/**
 * Floating circular loader pinned below the header's top-right corner while a
 * presentation generates in the background. Clicking it returns to the
 * generating deck. Survives reloads because StreamingProvider resumes the
 * durable job; renders nothing when idle or provider-less.
 */
export function ActiveGenerationIndicator({
	hidden = false,
	onOpen,
}: ActiveGenerationIndicatorProps) {
	const context = useContext(StreamingContext);
	if (hidden || !context?.streamingState.isStreaming) return null;

	return (
		<button
			type="button"
			onClick={() => onOpen(context.streamingState.presentationId)}
			aria-label="A presentation is generating. Open it"
			title="Presentation generating — click to open"
			className={`fixed ${HEADER_CLEARANCE} right-4 z-40 flex size-12 items-center justify-center rounded-full border border-blue-400/30 bg-[hsl(222,27%,12%)]/95 text-blue-200 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition-colors hover:border-blue-300/50 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400/40 md:right-6`}
		>
			<Spinner className="size-5" />
			<ChevronRight className="absolute -right-0.5 -top-0.5 size-3.5 rounded-full bg-[hsl(222,27%,12%)] text-blue-200/80" />
		</button>
	);
}
