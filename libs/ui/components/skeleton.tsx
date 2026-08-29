import { cn } from "@slidesage/ui/lib/utils";
import type * as React from "react";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="skeleton"
			className={cn("animate-pulse rounded-md bg-white/10", className)}
			{...props}
		/>
	);
}

export { Skeleton };
