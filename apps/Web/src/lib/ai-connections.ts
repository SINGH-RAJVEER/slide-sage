import type { AIConfigurationResponse, AIModelSelection, AIProvider } from "@slide-sage/types";
import { API_URL, readJsonResponse } from "./api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_URL}/api/ai${path}`, {
        credentials: "include",
        ...init,
        headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const data = await readJsonResponse<T & { error?: { message?: string } }>(response);
    if (!response.ok) throw new Error(data?.error?.message || "AI provider request failed");
    return data as T;
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
