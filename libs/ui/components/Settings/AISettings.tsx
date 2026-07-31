import type { AIConfigurationResponse, AIModelSelection, AIProvider } from "@slide-sage/types";
import { Button } from "@slide-sage/ui/components/button";
import { LoadingScreen } from "@slide-sage/ui/components/loading-screen";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@slide-sage/ui/components/select";
import { Spinner } from "@slide-sage/ui/components/spinner";
import { Check, KeyRound, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

const PROVIDERS: Array<{ id: AIProvider; label: string; keyUrl: string }> = [
    { id: "openai", label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys" },
    { id: "google", label: "Google Gemini", keyUrl: "https://aistudio.google.com/app/apikey" },
    { id: "anthropic", label: "Anthropic", keyUrl: "https://console.anthropic.com/settings/keys" },
];

const PROVIDER_LABELS = {
    openai: "OpenAI",
    google: "Google Gemini",
    anthropic: "Anthropic",
};

interface AISettingsProps {
    fetchConfiguration: () => Promise<AIConfigurationResponse>;
    connectProvider: (provider: AIProvider, apiKey: string) => Promise<void>;
    deleteProvider: (provider: AIProvider) => Promise<void>;
    selectModel: (selection: AIModelSelection) => Promise<void>;
}

export function AISettings({
    fetchConfiguration,
    connectProvider,
    deleteProvider,
    selectModel: saveModel,
}: AISettingsProps) {
    const [config, setConfig] = useState<AIConfigurationResponse | null>(null);
    const [keys, setKeys] = useState<Partial<Record<AIProvider, string>>>({});
    const [busy, setBusy] = useState<AIProvider | "selection" | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const refresh = async () => setConfig(await fetchConfiguration());

    useEffect(() => {
        void fetchConfiguration()
            .then(setConfig)
            .catch((error) => setMessage(error instanceof Error ? error.message : String(error)))
            .finally(() => setIsLoading(false));
    }, [fetchConfiguration]);

    const connect = async (provider: AIProvider) => {
        const apiKey = keys[provider]?.trim();
        if (!apiKey) return;
        setBusy(provider);
        setMessage(null);
        try {
            await connectProvider(provider, apiKey);
            setKeys((current) => ({ ...current, [provider]: "" }));
            await refresh();
            setMessage("Provider connected. New generations will use your saved model.");
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
            await deleteProvider(provider);
            await refresh();
            setMessage("Provider removed. OpenRouter resumes when no connections remain.");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(null);
        }
    };

    const selectModel = async (selection: AIModelSelection) => {
        setBusy("selection");
        setMessage(null);
        try {
            await saveModel(selection);
            await refresh();
            setMessage("Default generation model updated.");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(null);
        }
    };

    if (isLoading) {
        return <LoadingScreen label="Loading AI settings" />;
    }

    if (!config) {
        return (
            <div
                role="alert"
                className="flex min-h-64 items-center justify-center text-sm text-red-200"
            >
                {message || "AI settings could not be loaded."}
            </div>
        );
    }

    const selectionValue = config.selection
        ? `${config.selection.provider}:${config.selection.model}`
        : undefined;
    const isByok = config.generation.mode === "byok";

    return (
        <div className="space-y-10">
            <section className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                        Generation runtime
                    </div>
                    <h2 className="mt-2 text-xl font-semibold text-white">
                        {isByok ? "Your provider connection" : "SlideSage"}
                    </h2>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-white/55">
                        {isByok
                            ? "Generation is billed directly by your selected provider."
                            : "Generation uses SlideSage points until you connect a provider key."}
                    </p>
                </div>
                <div className="w-fit rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-right">
                    <p className="text-xs text-white/40">
                        {isByok ? "Provider billing" : "Points billing"}
                    </p>
                    <p className="mt-0.5 max-w-64 truncate text-sm font-medium text-white/80">
                        {config.generation.model || "Choose a model below"}
                    </p>
                </div>
            </section>

            <section className="border-t border-white/10 pt-10">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-white">Default model</h2>
                        <p className="mt-1 text-sm text-white/55">
                            Applied to new presentations and iterations.
                        </p>
                    </div>
                    {config.models.length > 0 ? (
                        <Select
                            value={selectionValue}
                            disabled={!config.eligibility.eligible || busy === "selection"}
                            onValueChange={(next) => {
                                const separator = next.indexOf(":");
                                void selectModel({
                                    provider: next.slice(0, separator) as AIProvider,
                                    model: next.slice(separator + 1),
                                });
                            }}
                        >
                            <SelectTrigger className="h-10 w-full border-white/10 bg-black/20 text-white/80 sm:w-72">
                                <SelectValue placeholder="Select a connected model" />
                            </SelectTrigger>
                            <SelectContent className="border-white/10 bg-gray-900 text-white">
                                {PROVIDERS.map((provider) => {
                                    const models = config.models.filter(
                                        (model) => model.provider === provider.id,
                                    );
                                    if (models.length === 0) return null;
                                    return (
                                        <SelectGroup key={provider.id}>
                                            <SelectLabel>{provider.label}</SelectLabel>
                                            {models.map((model) => (
                                                <SelectItem
                                                    key={`${model.provider}:${model.model}`}
                                                    value={`${model.provider}:${model.model}`}
                                                >
                                                    {model.label}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    ) : (
                        <p className="text-sm text-white/45">
                            Connect a provider to choose a default model.
                        </p>
                    )}
                </div>
            </section>

            <section className="border-t border-white/10 pt-10">
                <div>
                    <h2 className="text-lg font-semibold text-white">API keys</h2>
                    <p className="mt-1 text-sm leading-6 text-white/55">
                        Keys are validated server-side and encrypted at rest. Plaintext values are
                        never returned to this page.
                    </p>
                </div>
                {!config.eligibility.eligible ? (
                    <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
                        More than 50 points are required to add keys or change models. Existing
                        connected keys continue to generate normally.
                    </p>
                ) : null}
                {message ? (
                    <p role="status" className="mt-4 text-sm text-white/70">
                        {message}
                    </p>
                ) : null}
                <div className="mt-5 divide-y divide-white/10 border-y border-white/10">
                    {PROVIDERS.map((provider) => {
                        const connection = config.connections.find(
                            (item) => item.provider === provider.id,
                        );
                        return (
                            <div key={provider.id} className="py-5 first:pt-4 last:pb-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="flex items-center gap-2 font-medium text-white">
                                            <KeyRound className="size-4 text-white/45" />
                                            {PROVIDER_LABELS[provider.id]}
                                            {connection?.status === "valid" ? (
                                                <Check className="size-4 text-emerald-400" />
                                            ) : null}
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                            <a
                                                href={provider.keyUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-sky-300 hover:text-sky-200"
                                            >
                                                Create API key
                                            </a>
                                            {connection ? (
                                                <span className="text-white/45">
                                                    Connected {connection.keyHint}
                                                </span>
                                            ) : null}
                                        </div>
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
                                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                    <input
                                        type="password"
                                        aria-label={`${provider.label} API key`}
                                        autoComplete="off"
                                        value={keys[provider.id] || ""}
                                        onChange={(event) =>
                                            setKeys((current) => ({
                                                ...current,
                                                [provider.id]: event.target.value,
                                            }))
                                        }
                                        disabled={
                                            !config.eligibility.eligible || busy === provider.id
                                        }
                                        placeholder={
                                            connection ? "Enter replacement key" : "Enter API key"
                                        }
                                        className="h-10 min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition-colors focus:border-white/25 disabled:opacity-50"
                                    />
                                    <Button
                                        type="button"
                                        disabled={
                                            !config.eligibility.eligible ||
                                            busy === provider.id ||
                                            !keys[provider.id]?.trim()
                                        }
                                        onClick={() => void connect(provider.id)}
                                        className="h-10 w-full bg-white text-black hover:bg-white/90 sm:w-auto"
                                    >
                                        {busy === provider.id ? (
                                            <Spinner className="size-4" aria-hidden="true" />
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
        </div>
    );
}
