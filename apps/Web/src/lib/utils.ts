import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function getApiBaseUrl(rawValue: string | undefined): string {
    const value = rawValue?.trim() ?? "";
    if (!value) return "";

    if (value.includes("://apis:")) return "";

    const withoutTrailingSlash = value.replace(/\/+$/, "");
    if (!withoutTrailingSlash) return "";

    if (withoutTrailingSlash.startsWith("http://") || withoutTrailingSlash.startsWith("https://")) {
        return withoutTrailingSlash;
    }

    if (withoutTrailingSlash.startsWith("//")) {
        return `https:${withoutTrailingSlash}`;
    }

    if (/^[a-z0-9.-]+(?::\d+)?$/i.test(withoutTrailingSlash)) {
        return `https://${withoutTrailingSlash}`;
    }

    return withoutTrailingSlash;
}
