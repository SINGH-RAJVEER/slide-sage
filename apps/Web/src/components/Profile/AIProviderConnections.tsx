import type { AIConfigurationResponse, AIProvider } from "@slide-sage/types";
import { Check, KeyRound, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { connectAIProvider, deleteAIProvider, fetchAIConfiguration } from "@/lib/ai-connections";

const PROVIDERS: Array<{ id: AIProvider; label: string; keyUrl: string }> = [
    { id: "openai", label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys" },
    { id: "google", label: "Google Gemini", keyUrl: "https://aistudio.google.com/app/apikey" },
    { id: "anthropic", label: "Anthropic", keyUrl: "https://console.anthropic.com/settings/keys" },
];

export function AIProviderConnections() {
    const [config, setConfig] = useState<AIConfigurationResponse | null>(null);
    const [keys, setKeys] = useState<Partial<Record<AIProvider, string>>>({});
    const [busy, setBusy] = useState<AIProvider | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        void fetchAIConfiguration()
            .then(setConfig)
            .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    }, []);

    const refresh = async () => setConfig(await fetchAIConfiguration());

    const connect = async (provider: AIProvider) => {
        const apiKey = keys[provider]?.trim();
        if (!apiKey) return;
        setBusy(provider);
        setMessage(null);
        try {
            await connectAIProvider(provider, apiKey);
            setKeys((current) => ({ ...current, [provider]: "" }));
            await refresh();
            setMessage("Provider connected and validated.");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(null);
        }
    };

    const remove = async (provider: AIProvider) => {
        setBusy(provider);
        setMessage(null);
        try {
            await deleteAIProvider(provider);
            await refresh();
            setMessage("Provider connection removed.");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="space-y-4 rounded-xl border border-white/10 bg-black/20 p-6">
            <div>
                <h2 className="text-lg font-semibold text-white">AI provider connections</h2>
                <p className="mt-1 text-sm text-white/55">
                    Keys are validated server-side and encrypted at rest. Provider usage is billed
                    directly to your account.
                </p>
            </div>
            {config && !config.eligibility.eligible ? (
                <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
                    You need more than 50 points to connect or use provider keys.
                </p>
            ) : null}
            {message ? <p className="text-sm text-white/70">{message}</p> : null}
            <div className="space-y-3">
                {PROVIDERS.map((provider) => {
                    const connection = config?.connections.find(
                        (item) => item.provider === provider.id,
                    );
                    return (
                        <div
                            key={provider.id}
                            className="rounded-lg border border-white/10 bg-white/[0.03] p-4"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2 font-medium text-white">
                                        <KeyRound className="size-4 text-white/50" />
                                        {provider.label}
                                        {connection?.status === "valid" ? (
                                            <Check className="size-4 text-emerald-400" />
                                        ) : null}
                                    </div>
                                    <a
                                        href={provider.keyUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-1 inline-block text-xs text-sky-300 hover:text-sky-200"
                                    >
                                        Create a provider API key
                                    </a>
                                </div>
                                {connection ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Remove ${provider.label}`}
                                        disabled={busy === provider.id}
                                        onClick={() => void remove(provider.id)}
                                        className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                ) : null}
                            </div>
                            {connection ? (
                                <p className="mt-3 text-sm text-white/55">
                                    Connected {connection.keyHint}
                                </p>
                            ) : null}
                            <div className="mt-3 flex gap-2">
                                <input
                                    type="password"
                                    autoComplete="off"
                                    value={keys[provider.id] || ""}
                                    onChange={(event) =>
                                        setKeys((current) => ({
                                            ...current,
                                            [provider.id]: event.target.value,
                                        }))
                                    }
                                    disabled={!config?.eligibility.eligible || busy === provider.id}
                                    placeholder={
                                        connection ? "Enter replacement key" : "Enter API key"
                                    }
                                    className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-white/25 disabled:opacity-50"
                                />
                                <Button
                                    type="button"
                                    disabled={
                                        !config?.eligibility.eligible ||
                                        busy === provider.id ||
                                        !keys[provider.id]?.trim()
                                    }
                                    onClick={() => void connect(provider.id)}
                                    className="bg-white text-black hover:bg-white/90"
                                >
                                    {busy === provider.id ? (
                                        <LoaderCircle className="size-4 animate-spin" />
                                    ) : connection ? (
                                        "Replace"
                                    ) : (
                                        "Connect"
                                    )}
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
