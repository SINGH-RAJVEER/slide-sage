import { Spinner } from "@slidesage/ui/components/spinner";
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
            <Spinner aria-label={label} className="h-9 w-9 text-white" />
        </div>
    );
}
