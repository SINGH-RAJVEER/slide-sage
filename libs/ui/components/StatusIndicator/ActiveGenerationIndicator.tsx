import { ThinkingOrb } from "@slidesage/ui/components/thinking-orb";
import { useContext } from "react";
import { StreamingContext } from "../../context/StreamingContext";

interface ActiveGenerationIndicatorProps {
	/** Hidden on routes where the generation is already visible, e.g. the viewer. */
	hidden?: boolean;
	/** Called when the user follows the indicator back to the running generation. */
	onOpen: (presentationId: string | undefined) => void;
}

const HEADER_CLEARANCE = "top-[4.5rem]";

/**
 * Floating loader pinned below the header's top-right corner while a presentation
 * generates in the background. It expands to show the submitted prompt on hover
 * or focus.
 * Clicking it returns to the generating deck. Survives reloads because
 * StreamingProvider resumes the durable job; renders nothing when idle or
 * provider-less.
 */
export function ActiveGenerationIndicator({
	hidden = false,
	onOpen,
}: ActiveGenerationIndicatorProps) {
	const context = useContext(StreamingContext);
	if (hidden || !context?.streamingState.isStreaming) return null;
	const prompt = context.streamingState.prompt?.trim() || "Presentation";

	return (
		<button
			type="button"
			onClick={() => onOpen(context.streamingState.presentationId)}
			aria-label={`${prompt} is generating. Open it`}
			className={`group fixed ${HEADER_CLEARANCE} right-4 z-40 flex h-12 w-12 max-w-[calc(100vw-2rem)] flex-row-reverse items-center justify-start overflow-hidden rounded-full border border-blue-400/30 bg-[hsl(222,27%,12%)]/95 px-[0.8125rem] text-blue-200 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[width,border-color,color] duration-300 ease-out hover:w-72 hover:border-blue-300/50 hover:text-white focus-visible:w-72 focus-visible:border-blue-300/50 focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 motion-reduce:transition-none md:right-6`}
		>
			<ThinkingOrb size={20} aria-hidden="true" />
			<span
				aria-hidden="true"
				className="min-w-0 max-w-0 truncate whitespace-nowrap text-sm font-medium opacity-0 transition-[max-width,margin,opacity] duration-200 group-hover:mr-3 group-hover:max-w-56 group-hover:opacity-100 group-focus-visible:mr-3 group-focus-visible:max-w-56 group-focus-visible:opacity-100 motion-reduce:transition-none"
			>
				{prompt}
			</span>
		</button>
	);
}
