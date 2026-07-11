export function normalizeApiUrl(value: string | undefined): string {
    const trimmedValue = value?.trim().replace(/\/+$/, "") ?? "";
    if (!trimmedValue || trimmedValue.startsWith("/")) return trimmedValue;
    if (/^https?:\/\//i.test(trimmedValue)) return trimmedValue;

    const hostname = trimmedValue.split("/")[0]?.split(":")[0]?.toLowerCase();
    const protocol = hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https";

    return `${protocol}://${trimmedValue}`;
}

export const API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL);
