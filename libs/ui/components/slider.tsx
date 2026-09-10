import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@slidesage/ui/lib/utils";
import type * as React from "react";

function Slider({
	className,
	children,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
	return (
		<SliderPrimitive.Root
			data-slot="slider"
			className={cn(
				"relative flex w-full touch-none items-center select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track
				data-slot="slider-track"
				className="relative h-2 w-full grow overflow-hidden rounded-full bg-white/10"
			>
				<SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-white" />
			</SliderPrimitive.Track>
			{children}
		</SliderPrimitive.Root>
	);
}

function SliderThumb({
	className,
	children,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Thumb>) {
	return (
		<SliderPrimitive.Thumb
			data-slot="slider-thumb"
			className={cn(
				"flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white text-[11px] leading-none font-medium tabular-nums text-black shadow-sm outline-none transition-[color,box-shadow] focus-visible:ring-4 focus-visible:ring-white/40 disabled:pointer-events-none disabled:opacity-50",
				className,
			)}
			{...props}
		>
			{children}
		</SliderPrimitive.Thumb>
	);
}

export { Slider, SliderThumb };
