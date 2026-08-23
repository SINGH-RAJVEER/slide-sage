import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@slidesage/ui/lib/utils";
import type * as React from "react";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			className={cn(
				"peer data-[state=checked]:bg-white data-[state=unchecked]:bg-white/15 focus-visible:ring-white/40 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className="pointer-events-none block size-5 rounded-full bg-black shadow transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-white/70"
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
