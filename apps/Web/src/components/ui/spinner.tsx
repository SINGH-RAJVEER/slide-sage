import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Spinner({ className, ...props }: HTMLAttributes<HTMLOutputElement>) {
    return (
        <output
            aria-label="Loading"
            className={cn(
                "inline-block h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80",
                className,
            )}
            {...props}
        />
    );
}
