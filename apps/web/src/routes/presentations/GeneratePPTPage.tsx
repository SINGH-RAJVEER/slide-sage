import {
	BINARY_PPTX_TEMPLATE_CATALOG,
	type BinaryTemplateSelection,
	DEFAULT_BINARY_PPTX_TEMPLATE,
	type PresentationRetryOptions,
} from "@slidesage/types";
import { useStreaming } from "@slidesage/ui";
import { GenerateForm, GenerateOptionsBar } from "@slidesage/ui/components/Generate";
import TemplateSelector from "@slidesage/ui/components/Viewer/TemplateSelector";
import { useInstalledMarketplaceThemes } from "@slidesage/ui/hooks/useInstalledMarketplaceThemes";
import { requestGenerationNotificationPermission } from "@slidesage/ui/lib/generation-notifications";
import { useDebouncedCallback } from "@tanstack/react-pacer/debouncer";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "@/app/Header";
import { ROUTES } from "@/app/router/paths";

interface GenerateRouteState {
	retry?: PresentationRetryOptions;
	retryPresentationId?: string;
}

function templateSelection(
	reference: PresentationRetryOptions["template"],
): BinaryTemplateSelection {
	const template = BINARY_PPTX_TEMPLATE_CATALOG.find(
		(candidate) => candidate.id === reference?.id && candidate.version === reference.version,
	);
	return {
		id: template?.id ?? DEFAULT_BINARY_PPTX_TEMPLATE.id,
		version: template?.version ?? DEFAULT_BINARY_PPTX_TEMPLATE.version,
		previewThemeId: template?.previewThemeId ?? DEFAULT_BINARY_PPTX_TEMPLATE.previewThemeId,
	};
}

export default function GeneratePPTPage() {
	const location = useLocation();
	const retry = (location.state as GenerateRouteState | null)?.retry;
	const retryPresentationId = (location.state as GenerateRouteState | null)?.retryPresentationId;
	const retryPrompt = retry?.prompt.trim() ?? "";
	const retrySlideCount = Math.min(40, Math.max(5, retry?.slide_count ?? 5)).toString();
	const [prompt, setPrompt] = useState(retryPrompt);
	const [loading, setLoading] = useState(false);
	const [slideCount, setSlideCount] = useState(retrySlideCount);
	const [detailLevel, setDetailLevel] = useState(retry?.detail_level ?? "balanced");
	const [tonality, setTonality] = useState(retry?.tonality ?? "professional");
	const [useWebResearch, setUseWebResearch] = useState(retry?.research_enabled ?? false);
	const [selectedTemplate, setSelectedTemplate] = useState(() =>
		templateSelection(retry?.template),
	);
	const navigate = useNavigate();
	const { streamingState, generate } = useStreaming();
	const installedThemes = useInstalledMarketplaceThemes();

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

		const count = parseInt(slideCount, 10);

		if (useWebResearch) {
			navigate(ROUTES.research, {
				state: {
					prompt: normalizedPrompt,
					slideCount: count,
					detailLevel,
					tonality,
					retryPresentationId,
					template: selectedTemplate,
					...(retry?.ai ? { ai: retry.ai } : {}),
				},
			});
			return;
		}

		const streamingRequest = generate({
			prompt: normalizedPrompt,
			slideCount: count,
			detailLevel,
			tonality,
			retryPresentationId,
			ai: retry?.ai,
			template: selectedTemplate,
		});
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

	const enterActionRef = useRef<() => void>(() => {});
	enterActionRef.current = () => {
		if (!prompt.trim()) {
			document.getElementById("prompt")?.focus();
			return;
		}
		if (!loading && !streamingState.isStreaming) {
			handleGenerate();
		}
	};

	useEffect(() => {
		const handleGlobalEnter = (event: KeyboardEvent) => {
			if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
			const target = event.target;
			if (
				target instanceof Element &&
				target.closest('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]')
			) {
				return;
			}
			event.preventDefault();
			window.setTimeout(() => enterActionRef.current(), 0);
		};

		window.addEventListener("keydown", handleGlobalEnter, true);
		return () => window.removeEventListener("keydown", handleGlobalEnter, true);
	}, []);

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
					slideCount={slideCount}
					onDetailLevelChange={setDetailLevel}
					onTonalityChange={setTonality}
					onUseWebResearchChange={setUseWebResearch}
					onSlideCountChange={setSlideCount}
				/>
				<TemplateSelector
					selectedTemplate={selectedTemplate}
					onTemplateChange={setSelectedTemplate}
					installedThemes={installedThemes}
					className="mt-2"
				/>
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
