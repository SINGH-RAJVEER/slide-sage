/// <reference lib="dom" />

import { afterEach, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { AISettings } from "@/components/Settings/AISettings";

const originalFetch = globalThis.fetch;

HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = () => {};
HTMLElement.prototype.releasePointerCapture = () => {};
HTMLElement.prototype.scrollIntoView = () => {};

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function jsonResponse(value: unknown): Response {
    return new Response(JSON.stringify(value), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

it("shows point-funded OpenRouter until a provider is connected", async () => {
    globalThis.fetch = mock(() =>
        Promise.resolve(
            jsonResponse({
                generation: {
                    mode: "openrouter",
                    model: "google/gemma-4-26b-a4b-it",
                    billing: "points",
                },
                eligibility: {
                    eligible: true,
                    slideTokens: 100,
                    minimumPointsExclusive: 50,
                },
                connections: [],
                models: [],
                selection: null,
            }),
        ),
    ) as unknown as typeof fetch;

    const view = render(<AISettings />);

    expect(await view.findByText("SlideSage")).toBeInTheDocument();
    expect(view.getByText("Points billing")).toBeInTheDocument();
    expect(view.getByText("Connect a provider to choose a default model.")).toBeInTheDocument();
    for (const input of view.getAllByLabelText(/API key$/)) {
        expect(input).toHaveAttribute("type", "password");
    }
});

it("updates the saved default model from settings", async () => {
    const config = {
        generation: { mode: "byok", model: "gpt-4.1", billing: "provider" },
        eligibility: { eligible: true, slideTokens: 100, minimumPointsExclusive: 50 },
        connections: [
            {
                provider: "openai",
                status: "valid",
                keyHint: "••••1234",
                validatedAt: "2026-01-01T00:00:00.000Z",
            },
        ],
        models: [
            {
                provider: "openai",
                model: "gpt-4.1",
                label: "GPT-4.1",
                description: "High quality",
            },
            {
                provider: "openai",
                model: "gpt-4.1-mini",
                label: "GPT-4.1 mini",
                description: "Faster",
            },
        ],
        selection: { provider: "openai", model: "gpt-4.1" },
    };
    const fetchMock = mock((_url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "PUT") {
            return Promise.resolve(
                jsonResponse({ selection: { provider: "openai", model: "gpt-4.1-mini" } }),
            );
        }
        return Promise.resolve(jsonResponse(config));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const view = render(<AISettings />);
    const selector = await view.findByRole("combobox");
    fireEvent.keyDown(selector, { key: "ArrowDown" });
    fireEvent.click(await view.findByRole("option", { name: "GPT-4.1 mini" }));

    expect(await view.findByText("Default generation model updated.")).toBeInTheDocument();

    const selectionRequest = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(selectionRequest?.[0]).toContain("/api/ai/selection");
    expect(JSON.parse(String(selectionRequest?.[1]?.body))).toEqual({
        provider: "openai",
        model: "gpt-4.1-mini",
    });
});
