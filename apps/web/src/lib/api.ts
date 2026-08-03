export function normalizeApiUrl(value: string | undefined): string {
    const trimmedValue = value?.trim().replace(/\/+$/, "") ?? "";
    if (!trimmedValue || trimmedValue.startsWith("/")) return trimmedValue;
    if (/^https?:\/\//i.test(trimmedValue)) return trimmedValue.replace(/\/api$/i, "");

    const hostname = trimmedValue.split("/")[0]?.split(":")[0]?.toLowerCase();
    const protocol = hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https";

    return `${protocol}://${trimmedValue.replace(/\/api$/i, "")}`;
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);
const CLOUDFLARE_PAGES_HOST_SUFFIX = ".pages.dev";
const DEPLOYED_API_URL = "https://api.slidesage.app";

export function resolveApiUrl(
    value: string | undefined,
    isProduction: boolean,
    frontendOrigin?: string,
): string {
    const normalizedUrl = normalizeApiUrl(value);
    if (!normalizedUrl || normalizedUrl.startsWith("/")) {
        if (isProduction && !normalizedUrl && frontendOrigin) {
            try {
                const frontendHostname = new URL(frontendOrigin).hostname.toLowerCase();
                if (frontendHostname.endsWith(CLOUDFLARE_PAGES_HOST_SUFFIX)) {
                    return DEPLOYED_API_URL;
                }
            } catch {
                return normalizedUrl;
            }
        }
        return normalizedUrl;
    }

    try {
        if (!isProduction) return normalizedUrl;

        const hostname = new URL(normalizedUrl).hostname.toLowerCase();
        return LOOPBACK_HOSTNAMES.has(hostname) ? "" : normalizedUrl;
    } catch {
        return normalizedUrl;
    }
}

export async function readJsonResponse<T>(response: Response): Promise<T | null> {
    try {
        return (await response.json()) as T;
    } catch {
        return null;
    }
}

export const API_URL = resolveApiUrl(
    import.meta.env["VITE_API_URL"],
    import.meta.env.PROD,
    typeof window === "undefined" ? undefined : window.location.origin,
);
