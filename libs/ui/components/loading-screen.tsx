import { ThinkingOrb } from "@slidesage/ui/components/thinking-orb";
import { cn } from "@slidesage/ui/lib/utils";
import type { HTMLAttributes } from "react";

interface LoadingScreenProps extends HTMLAttributes<HTMLDivElement> {
	label?: string;
}

export function LoadingScreen({ className, label = "Loading", ...props }: LoadingScreenProps) {
	return (
		<div
			className={cn("fixed inset-0 z-50 grid min-h-dvh w-full place-items-center", className)}
			{...props}
		>
			<ThinkingOrb size={64} aria-label={label} />
		</div>
	);
}
