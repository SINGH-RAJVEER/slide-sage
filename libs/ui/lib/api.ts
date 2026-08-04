export async function readJsonResponse<T>(response: Response): Promise<T | null> {
    try {
        return (await response.json()) as T;
    } catch {
        return null;
    }
}

export function normalizeApiUrl(value: string | undefined): string {
    const trimmed = value?.trim();
    if (!trimmed) return "";

    const withProtocol =
        trimmed.startsWith("/") || /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
            ? trimmed
            : `https://${trimmed}`;

    return withProtocol.replace(/\/+$/, "").replace(/\/api$/, "");
}

export const API_URL = normalizeApiUrl(import.meta.env["VITE_API_URL"]);
