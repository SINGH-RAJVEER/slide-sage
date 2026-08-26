import type { AIConfigurationResponse, AIModelSelection, AIProvider } from "@slidesage/types";
import { Button } from "@slidesage/ui/components/button";
import { LoadingScreen } from "@slidesage/ui/components/loading-screen";
import { FloatingSettingsNotice } from "@slidesage/ui/components/Settings/FloatingSettingsNotice";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@slidesage/ui/components/select";
import { Switch } from "@slidesage/ui/components/switch";
import { ThinkingOrb } from "@slidesage/ui/components/thinking-orb";
import { Tooltip, TooltipContent, TooltipTrigger } from "@slidesage/ui/components/tooltip";
import { Info, KeyRound, Trash2 } from "lucide-react";
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
	setProviderEnabled: (provider: AIProvider, enabled: boolean) => Promise<void>;
}

export function AISettings({
	fetchConfiguration,
	connectProvider,
	deleteProvider,
	selectModel: saveModel,
	setProviderEnabled,
}: AISettingsProps) {
	const [config, setConfig] = useState<AIConfigurationResponse | null>(null);
	const [keys, setKeys] = useState<Partial<Record<AIProvider, string>>>({});
	const [busy, setBusy] = useState<AIProvider | "selection" | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const refresh = async () => {
		const next = await fetchConfiguration();
		setConfig(next);
		return next;
	};

	useEffect(() => {
		void fetchConfiguration()
			.then(setConfig)
			.catch((error) => setMessage(error instanceof Error ? error.message : String(error)))
			.finally(() => setIsLoading(false));
	}, [fetchConfiguration]);

	useEffect(() => () => setNotice(null), []);

	const reportError = (error: unknown) =>
		setNotice(error instanceof Error ? error.message : String(error));

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
			reportError(error);
		} finally {
			setBusy(null);
		}
	};

	const toggleProvider = async (provider: AIProvider, enabled: boolean) => {
		setBusy(provider);
		setMessage(null);
		try {
			await setProviderEnabled(provider, enabled);
			const next = await refresh();
			if (enabled) {
				const defaultModel = next.models.find((model) => model.provider === provider);
				if (defaultModel) {
					await saveModel({ provider, model: defaultModel.model });
					await refresh();
				}
			}
			setMessage(
				enabled
					? `${PROVIDER_LABELS[provider]} will be used for generation.`
					: `${PROVIDER_LABELS[provider]} paused.`,
			);
		} catch (error) {
			reportError(error);
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
			reportError(error);
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
			reportError(error);
		} finally {
			setBusy(null);
		}
	};

	if (isLoading) {
		return <LoadingScreen label="Loading AI settings" />;
	}

	if (!config) {
		return (
			<div role="alert" className="flex min-h-64 items-center justify-center text-sm text-red-200">
				{message || "AI settings could not be loaded."}
			</div>
		);
	}

	return (
		<div className="space-y-10">
			<FloatingSettingsNotice error={notice} onDismiss={() => setNotice(null)} />
			<section>
				<div className="flex items-center gap-2">
					<h2 className="text-lg font-semibold text-white">API keys</h2>
					<Tooltip>
						<TooltipTrigger
							type="button"
							aria-label="About API key security"
							className="rounded-full text-white/40 transition-colors hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
						>
							<Info className="size-4" />
						</TooltipTrigger>
						<TooltipContent>
							Keys are validated server-side and encrypted at rest. Plaintext values are never
							returned to this page. Web research is billed by SlideSage and still costs points even
							when generating with your own provider key.
						</TooltipContent>
					</Tooltip>
				</div>
				{!config.eligibility.eligible ? (
					<p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
						More than 50 points are required to add keys or change models. Existing connected keys
						continue to generate normally.
					</p>
				) : null}
				{message ? (
					<p role="status" className="mt-4 text-sm text-white/70">
						{message}
					</p>
				) : null}
				<div className="mt-5 divide-y divide-white/10 border-b border-white/10">
					{PROVIDERS.map((provider) => {
						const connection = config.connections.find((item) => item.provider === provider.id);
						const providerModels = config.models.filter((model) => model.provider === provider.id);
						return (
							<div key={provider.id} className="py-5 first:pt-4 last:pb-4">
								<div className="flex items-start justify-between gap-4">
									<div>
										<div className="flex items-center gap-2 font-medium text-white">
											<KeyRound className="size-4 text-white/45" />
											{PROVIDER_LABELS[provider.id]}
											{connection ? (
												<Button
													type="button"
													variant="ghost"
													size="icon"
													aria-label={`Remove ${provider.label}`}
													disabled={busy === provider.id}
													onClick={() => void remove(provider.id)}
													className="size-7 text-red-300 hover:bg-red-500/10 hover:text-red-200"
												>
													<Trash2 className="size-4" />
												</Button>
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
												<span className="text-white/45">Connected {connection.keyHint}</span>
											) : null}
										</div>
										{config.modelCatalogErrors?.[provider.id] ? (
											<p className="mt-2 text-xs text-amber-200/80">
												{config.modelCatalogErrors[provider.id]}
											</p>
										) : null}
									</div>
									{connection ? (
										<Switch
											aria-label={`Use ${PROVIDER_LABELS[provider.id]} for generation`}
											checked={connection.enabled}
											disabled={busy === provider.id}
											onCheckedChange={(next) => void toggleProvider(provider.id, next)}
										/>
									) : null}
								</div>
								{connection && providerModels.length > 0 ? (
									<Select
								value={
									config.selection?.provider === provider.id ? config.selection.model : ""
								}
								disabled={!connection.enabled || !config.eligibility.eligible || busy === "selection"}
										onValueChange={(model) => void selectModel({ provider: provider.id, model })}
									>
										<SelectTrigger
											aria-label={`${provider.label} model`}
											className="mt-3 h-10 w-full border-white/10 bg-black/20 text-white/80 sm:w-72"
										>
											<SelectValue placeholder="Select model" />
										</SelectTrigger>
										<SelectContent className="border-white/10 bg-gray-900 text-white">
											{providerModels.map((model) => (
												<SelectItem key={model.model} value={model.model}>
													{model.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								) : null}
								{!connection ? (
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
											disabled={!config.eligibility.eligible || busy === provider.id}
											placeholder="Enter API key"
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
												<ThinkingOrb size={20} aria-hidden="true" />
											) : (
												"Connect"
											)}
										</Button>
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			</section>
		</div>
	);
}
