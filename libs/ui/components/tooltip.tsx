import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@slidesage/ui/lib/utils";
import type * as React from "react";

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
	return (
		<TooltipPrimitive.Provider delayDuration={200}>
			<TooltipPrimitive.Root data-slot="tooltip" {...props} />
		</TooltipPrimitive.Provider>
	);
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
	return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
	className,
	sideOffset = 6,
	children,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				data-slot="tooltip-content"
				sideOffset={sideOffset}
				className={cn(
					"animate-in fade-in-0 zoom-in-95 max-w-72 rounded-md border border-white/10 bg-gray-900 px-3 py-2 text-xs leading-5 text-white/85 shadow-md",
					className,
				)}
				{...props}
			>
				{children}
			</TooltipPrimitive.Content>
		</TooltipPrimitive.Portal>
	);
}

export { Tooltip, TooltipContent, TooltipTrigger };
