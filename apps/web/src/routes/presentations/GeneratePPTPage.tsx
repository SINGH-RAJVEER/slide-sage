import type { PresentationRetryOptions, ThemeId } from "@slidesage/types";
import { useStreaming } from "@slidesage/ui";
import { GenerateForm, GenerateOptionsBar } from "@slidesage/ui/components/Generate";
import { useInstalledMarketplaceThemes } from "@slidesage/ui/hooks/useInstalledMarketplaceThemes";
import { fetchAIConfiguration } from "@slidesage/ui/lib/ai-connections";
import { requestGenerationNotificationPermission } from "@slidesage/ui/lib/generation-notifications";
import { useDebouncedCallback } from "@tanstack/react-pacer/debouncer";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "@/app/Header";
import { ROUTES } from "@/app/router/paths";

interface GenerateRouteState {
	retry?: PresentationRetryOptions;
	retryPresentationId?: string;
}

export default function GeneratePPTPage() {
	const location = useLocation();
	const retry = (location.state as GenerateRouteState | null)?.retry;
	const retryPresentationId = (location.state as GenerateRouteState | null)?.retryPresentationId;
	const retryPrompt = retry?.prompt.trim() ?? "";
	const retrySlideCount = retry?.slide_count.toString() ?? "5";
	const presetSlideCounts = ["5", "10", "15", "20", "25", "30"];
	const [prompt, setPrompt] = useState(retryPrompt);
	const [loading, setLoading] = useState(false);
	const [slideCount, setSlideCount] = useState(retrySlideCount);
	const [slideCountMode, setSlideCountMode] = useState(
		presetSlideCounts.includes(retrySlideCount) ? "preset" : "custom",
	);
	const [customSlideCount, setCustomSlideCount] = useState(retrySlideCount);
	const [detailLevel, setDetailLevel] = useState(retry?.detail_level ?? "balanced");
	const [tonality, setTonality] = useState(retry?.tonality ?? "professional");
	const [useWebResearch, setUseWebResearch] = useState(retry?.research_enabled ?? false);
	const [theme, setTheme] = useState<ThemeId>(retry?.theme ?? "corporate-blue");
	const [generationMode, setGenerationMode] = useState<"openrouter" | "byok">("openrouter");
	const navigate = useNavigate();
	const { streamingState, startStreaming } = useStreaming();
	const installedThemes = useInstalledMarketplaceThemes();

	useEffect(() => {
		void fetchAIConfiguration()
			.then((config) => setGenerationMode(config.generation.mode))
			.catch(() => undefined);
	}, []);

	useEffect(() => {
		if (streamingState.error) {
			console.error("Presentation generation failed:", streamingState.error);
			setLoading(false);
		}
	}, [streamingState.error]);

	useEffect(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
			if (
				e.key.toLowerCase() === "f" &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey &&
				document.activeElement?.tagName !== "INPUT" &&
				document.activeElement?.tagName !== "TEXTAREA"
			) {
				e.preventDefault();
				const input = document.getElementById("prompt");
				if (input) {
					input.focus();
				}
			}
		};

		window.addEventListener("keydown", handleGlobalKeyDown);
		return () => window.removeEventListener("keydown", handleGlobalKeyDown);
	}, []);

	const handleGenerateInternal = async (selectedPrompt: string) => {
		const normalizedPrompt = selectedPrompt.trim();
		if (!normalizedPrompt || streamingState.isStreaming) return;

		setLoading(true);

		const count =
			slideCountMode === "preset" ? parseInt(slideCount, 10) : parseInt(customSlideCount, 10);

		if (useWebResearch) {
			navigate(ROUTES.research, {
				state: {
					prompt: normalizedPrompt,
					slideCount: count,
					detailLevel,
					tonality,
					theme,
					retryPresentationId,
					...(retry?.ai ? { ai: retry.ai } : {}),
				},
			});
			return;
		}

		const streamingRequest = startStreaming(
			normalizedPrompt,
			count,
			detailLevel,
			tonality,
			false,
			undefined,
			retryPresentationId,
			theme,
			retry?.ai,
		);
		navigate(ROUTES.presentation, {
			state: { isStreaming: true },
		});

		const success = await streamingRequest;
		if (!success) {
			setLoading(false);
		}
	};

	const debouncedGenerate = useDebouncedCallback(handleGenerateInternal, {
		wait: 500,
		leading: true,
	});

	const handleGenerate = () => {
		if (!prompt.trim()) return;

		requestGenerationNotificationPermission();
		debouncedGenerate(prompt);
	};

	return (
		<div className="flex min-h-dvh w-full flex-col overflow-x-hidden bg-transparent">
			<Header />

			<div
				data-generation-selectors
				className="relative flex w-full flex-col items-center px-4 pt-6 md:pt-8"
			>
				<GenerateOptionsBar
					detailLevel={detailLevel}
					tonality={tonality}
					useWebResearch={useWebResearch}
					slideCountMode={slideCountMode}
					slideCount={slideCount}
					customSlideCount={customSlideCount}
					theme={theme}
					onDetailLevelChange={setDetailLevel}
					onTonalityChange={setTonality}
					onUseWebResearchChange={setUseWebResearch}
					onSlideCountModeChange={setSlideCountMode}
					onSlideCountChange={setSlideCount}
					onCustomSlideCountChange={setCustomSlideCount}
					onThemeChange={setTheme}
					installedThemes={installedThemes}
				/>
				{prompt.trim() && (
					<p
						data-generation-estimate
						className="absolute top-full mt-4 text-center text-lg font-medium text-white/80"
					>
						{generationMode === "byok"
							? `Model usage is billed by your provider${useWebResearch ? ". Research costs 1 point on success." : "."}`
							: "Model usage is charged from measured provider tokens."}
					</p>
				)}
			</div>

			<main className="flex w-full flex-1 items-center justify-center overflow-y-auto px-4 py-12 md:px-8">
				<div className="w-full max-w-5xl">
					<div className="relative -top-4 mx-auto flex w-full max-w-4xl flex-col items-center justify-center md:-top-6">
						<GenerateForm
							prompt={prompt}
							loading={loading || streamingState.isStreaming}
							onPromptChange={setPrompt}
							onGenerate={handleGenerate}
						/>
					</div>
				</div>
			</main>
		</div>
	);
}
