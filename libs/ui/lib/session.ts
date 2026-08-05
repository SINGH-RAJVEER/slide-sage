import { API_URL } from "./api";

export interface SessionUser {
	id: string;
	name: string | null;
	email: string;
	image: string | null;
	emailVerified: boolean;
	slideTokens: number;
	createdAt: string;
	updatedAt: string;
}

const SESSION_RETRY_DELAYS_MS = [0, 250, 500];
export const SESSION_STALE_AFTER_MS = 5 * 60 * 1000;

export function isSessionCheckStale(
	lastCheckedAt: number | null,
	now = Date.now(),
	staleAfterMs = SESSION_STALE_AFTER_MS,
): boolean {
	return lastCheckedAt === null || now - lastCheckedAt >= staleAfterMs;
}

function wait(delayMs: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function fetchSessionWithRetry(
	fetchSession: typeof fetch = fetch,
	retryDelaysMs = SESSION_RETRY_DELAYS_MS,
): Promise<SessionUser | null> {
	let lastError: unknown;

	for (const [attempt, delayMs] of retryDelaysMs.entries()) {
		if (delayMs > 0) await wait(delayMs);

		try {
			const response = await fetchSession(`${API_URL}/auth/get-session`, {
				credentials: "include",
			});

			if (response.ok) {
				const contentType = response.headers.get("content-type") || "";
				const data = contentType.includes("application/json") ? await response.json() : null;
				return data?.user || null;
			}

			if (response.status < 500) return null;
		} catch (error) {
			lastError = error;
		}

		if (attempt === retryDelaysMs.length - 1 && lastError) {
			console.error("Failed to fetch session:", lastError);
		}
	}

	return null;
}
