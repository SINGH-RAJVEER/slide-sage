export async function readJsonResponse<T>(response: Response): Promise<T | null> {
    try {
        return (await response.json()) as T;
    } catch {
        return null;
    }
}

export const API_URL = import.meta.env["VITE_API_URL"];
