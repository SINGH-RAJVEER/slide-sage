import type {
	AIConfigurationResponse,
	AIModelSelection,
	AIProvider,
	UpdateAIConnectionEnabledRequest,
} from "@slidesage/types";
import { API_URL, readJsonResponse } from "./api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${API_URL}/ai${path}`, {
		credentials: "include",
		...init,
		headers: { "Content-Type": "application/json", ...init?.headers },
	});
	if (response.ok && response.status === 204) return undefined as T;

	const data = await readJsonResponse<T & { error?: { message?: string } }>(response);
	if (!data) {
		throw new Error(
			response.ok
				? "The AI settings service returned an invalid response."
				: "AI provider request failed",
		);
	}
	if (!response.ok) throw new Error(data?.error?.message || "AI provider request failed");
	return data;
}

export function fetchAIConfiguration(): Promise<AIConfigurationResponse> {
	return request("/config");
}

export function connectAIProvider(provider: AIProvider, apiKey: string): Promise<void> {
	return request("/connections", {
		method: "POST",
		body: JSON.stringify({ provider, apiKey }),
	});
}

export function deleteAIProvider(provider: AIProvider): Promise<void> {
	return request(`/connections/${provider}`, { method: "DELETE" });
}

export function selectAIModel(selection: AIModelSelection): Promise<void> {
	return request("/selection", { method: "PUT", body: JSON.stringify(selection) });
}

export function setAIConnectionEnabled(provider: AIProvider, enabled: boolean): Promise<void> {
	const body: UpdateAIConnectionEnabledRequest = { enabled };
	return request(`/connections/${provider}/enabled`, { method: "PUT", body: JSON.stringify(body) });
}
