export function normalizeApiUrl(value: string | undefined): string {
    const trimmedValue = value?.trim().replace(/\/+$/, "") ?? "";
    if (!trimmedValue || trimmedValue.startsWith("/")) return trimmedValue;
    if (/^https?:\/\//i.test(trimmedValue)) return trimmedValue;

    const hostname = trimmedValue.split("/")[0]?.split(":")[0]?.toLowerCase();
    const protocol = hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https";

    return `${protocol}://${trimmedValue}`;
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

export function resolveApiUrl(value: string | undefined, isProduction: boolean): string {
    const normalizedUrl = normalizeApiUrl(value);
    if (!isProduction || !normalizedUrl || normalizedUrl.startsWith("/")) return normalizedUrl;

    try {
        const hostname = new URL(normalizedUrl).hostname.toLowerCase();
        return LOOPBACK_HOSTNAMES.has(hostname) ? "" : normalizedUrl;
    } catch {
        return normalizedUrl;
    }
}

export const API_URL = resolveApiUrl(import.meta.env["VITE_API_URL"], import.meta.env.PROD);
