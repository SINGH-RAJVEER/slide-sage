import type { AIModelSelection, ResearchPayload, ThemeId } from "@slidesage/types";
import { useStreaming } from "@slidesage/ui";
import { Button } from "@slidesage/ui/components/button";
import { Spinner } from "@slidesage/ui/components/spinner";
import { requestGenerationNotificationPermission } from "@slidesage/ui/lib/generation-notifications";
import { ArrowLeft, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "@/app/Header";
import { ROUTES } from "@/app/router/paths";

interface ResearchRouteState {
	prompt: string;
	slideCount: number;
	detailLevel: string;
	tonality: string;
	theme: ThemeId;
	researchPayload?: ResearchPayload;
	retryPresentationId?: string;
	ai?: AIModelSelection;
}

type ResearchStatus = "loading" | "ready" | "error";

export default function GenerateResearchPage() {
	const location = useLocation();
	const navigate = useNavigate();
	const { streamingState, researchPreviewState, previewResearch, generate } = useStreaming();

	const routeState = location.state as ResearchRouteState | null;
	const prompt = routeState?.prompt?.trim() ?? "";
	const slideCount = routeState?.slideCount ?? 0;
	const detailLevel = routeState?.detailLevel ?? "balanced";
	const tonality = routeState?.tonality ?? "professional";
	const theme = routeState?.theme ?? "corporate-blue";
	const savedResearch = routeState?.researchPayload;
	const retryPresentationId = routeState?.retryPresentationId;
	const ai = routeState?.ai;

	const [isProceeding, setIsProceeding] = useState(false);
	const [researchAttempt, setResearchAttempt] = useState(0);
	const isProceedingRef = useRef(false);

	const researchRequest = useMemo(
		() => ({
			prompt,
			slideCount,
			detailLevel,
			tonality,
		}),
		[detailLevel, prompt, slideCount, tonality],
	);
	const sources = researchPreviewState.sources;
	const estimatedTokens = researchPreviewState.estimatedTokens;
	const error = researchPreviewState.error ?? "";
	const researchStatus: ResearchStatus =
		researchPreviewState.status === "ready"
			? "ready"
			: researchPreviewState.status === "error"
				? "error"
				: "loading";

	const hasSources = sources.length > 0;
	const isLoading = researchStatus === "loading";

	const getSourceLabel = (url: string) => {
		try {
			return new URL(url).hostname;
		} catch {
			return url;
		}
	};

	useEffect(() => {
		if (!prompt || !slideCount) {
			navigate(ROUTES.generate);
		}
	}, [navigate, prompt, slideCount]);

	useEffect(() => {
		if (!prompt || !slideCount) return;
		void previewResearch(researchRequest, savedResearch, researchAttempt > 0);
	}, [prompt, slideCount, researchAttempt, researchRequest, savedResearch, previewResearch]);

	const handleProceed = useCallback(async () => {
		if (
			!prompt ||
			!slideCount ||
			researchStatus !== "ready" ||
			streamingState.isStreaming ||
			isProceedingRef.current
		) {
			return;
		}

		requestGenerationNotificationPermission();
		isProceedingRef.current = true;
		setIsProceeding(true);

		const payload: ResearchPayload = {
			sources,
			...(estimatedTokens === null ? {} : { estimated_tokens: estimatedTokens }),
		};

		const streamingRequest = generate({
			prompt,
			slideCount,
			detailLevel,
			tonality,
			researchEnabled: true,
			researchPayload: payload,
			retryPresentationId,
			theme,
			ai,
		});
		navigate(ROUTES.presentation, { state: { isStreaming: true } });

		const success = await streamingRequest;
		if (!success) {
			isProceedingRef.current = false;
			setIsProceeding(false);
		}
	}, [
		detailLevel,
		estimatedTokens,
		ai,
		prompt,
		researchStatus,
		retryPresentationId,
		theme,
		navigate,
		slideCount,
		sources,
		generate,
		streamingState.isStreaming,
		tonality,
	]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.key !== "Enter" ||
				event.repeat ||
				event.shiftKey ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey
			) {
				return;
			}

			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable || target.closest("a, button, input, textarea, select") !== null)
			) {
				return;
			}

			event.preventDefault();
			void handleProceed();
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleProceed]);

	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-transparent">
			<Header />
			<div className="relative min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
				<button
					type="button"
					onClick={() => navigate(-1)}
					className="absolute left-4 top-4 z-10 rounded-md p-2 text-white/60 transition-colors hover:bg-white/5 hover:text-white md:left-8 md:top-8"
					aria-label="Go back"
				>
					<ArrowLeft className="h-5 w-5" />
				</button>

				<div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-8 lg:px-12">
					<div className="space-y-8">
						<div className="text-center">
							<h2 className="text-3xl font-semibold text-white md:text-4xl">Research Insights</h2>
						</div>

						{researchStatus === "error" && (
							<div className="flex flex-col items-center gap-4 rounded-lg border border-red-500/20 bg-red-500/10 px-6 py-5 text-center text-red-200">
								<p>{error}</p>
								<Button
									type="button"
									onClick={() => setResearchAttempt((attempt) => attempt + 1)}
									className="h-10 rounded-md border border-red-200/20 bg-transparent px-4 text-red-100 hover:bg-red-200/10"
								>
									<RefreshCw className="h-4 w-4" />
									Retry research
								</Button>
							</div>
						)}

						<div className="space-y-6">
							<div className="flex items-center justify-between">
								<h3 className="flex items-center gap-2 text-xl font-semibold text-white/90">
									Sources
									{isLoading && <Spinner className="text-white/50" />}
								</h3>
								{hasSources && (
									<span className="text-sm text-white/45">
										{sources.length} {sources.length === 1 ? "source" : "sources"}
									</span>
								)}
							</div>

							<div className="max-h-[62dvh] overflow-auto rounded-md border border-white/10 bg-black/15">
								<table
									className="w-full min-w-full table-fixed text-left md:min-w-[880px]"
									aria-label="Research sources"
								>
									<colgroup>
										<col className="w-auto md:w-[28%]" />
										<col className="hidden md:table-column md:w-[48%]" />
										<col className="hidden md:table-column md:w-[17%]" />
										<col className="w-14 md:w-[7%]" />
									</colgroup>
									<thead className="sticky top-0 z-20 bg-[hsl(222,27%,12%)]">
										<tr className="border-b border-white/10 bg-white/[0.025]">
											<th
												scope="col"
												className="sticky top-0 bg-[hsl(222,27%,12%)] px-4 py-3 text-xs font-medium text-white/45"
											>
												Source
											</th>
											<th
												scope="col"
												className="sticky top-0 hidden bg-[hsl(222,27%,12%)] px-4 py-3 text-xs font-medium text-white/45 md:table-cell"
											>
												Research note
											</th>
											<th
												scope="col"
												className="sticky top-0 hidden bg-[hsl(222,27%,12%)] px-4 py-3 text-xs font-medium text-white/45 md:table-cell"
											>
												Details
											</th>
											<th
												scope="col"
												className="sticky right-0 top-0 bg-[hsl(222,27%,12%)] px-3 py-3"
											>
												<span className="sr-only">Open source</span>
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-white/[0.07]">
										{hasSources &&
											sources.map((source) => {
												const sourceTitle = source.title || getSourceLabel(source.url);

												return (
													<tr
														key={source.url}
														className="group/row transition-colors hover:bg-white/[0.035]"
													>
														<td className="px-5 py-5 align-top">
															<p className="break-words text-sm font-medium leading-5 text-white/90">
																{sourceTitle}
															</p>
															<p className="mt-1 truncate text-xs text-white/35">
																{getSourceLabel(source.url)}
															</p>
															<p className="mt-3 line-clamp-4 whitespace-pre-line text-sm leading-6 text-white/60 md:hidden">
																{source.summary ||
																	source.snippet ||
																	"No preview available for this source."}
															</p>
														</td>
														<td className="hidden px-5 py-5 align-top md:table-cell">
															<p className="line-clamp-4 whitespace-pre-line text-sm leading-6 text-white/60">
																{source.summary ||
																	source.snippet ||
																	"No preview available for this source."}
															</p>
														</td>
														<td className="hidden px-5 py-5 align-top text-xs leading-5 text-white/45 md:table-cell">
															{source.author || source.published_date ? (
																<div className="space-y-0.5">
																	{source.author && (
																		<p className="truncate text-white/60">{source.author}</p>
																	)}
																	{source.published_date && <p>{source.published_date}</p>}
																</div>
															) : (
																<span className="text-white/30">Not listed</span>
															)}
														</td>
														<td className="sticky right-0 bg-background/95 px-3 py-5 text-center align-top transition-colors group-hover/row:bg-[#121214]">
															<a
																href={source.url}
																target="_blank"
																rel="noopener noreferrer"
																aria-label={`Open source: ${sourceTitle}`}
																title="Open source"
																className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-white/45 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
															>
																<ExternalLink className="h-4 w-4" />
															</a>
														</td>
													</tr>
												);
											})}

										{researchStatus === "ready" && !hasSources && (
											<tr>
												<td colSpan={4} className="px-6 py-10 text-center text-sm text-white/45">
													No sources found. Try a different phrasing or a broader topic.
												</td>
											</tr>
										)}

										{isLoading &&
											sources.length === 0 &&
											[1, 2, 3, 4].map((i) => (
												<tr key={i} className="animate-pulse">
													<td className="px-4 py-5">
														<div className="mb-2 h-4 w-4/5 rounded bg-white/5" />
														<div className="h-3 w-2/5 rounded bg-white/5" />
													</td>
													<td className="hidden px-4 py-5 md:table-cell">
														<div className="mb-2 h-3 w-full rounded bg-white/5" />
														<div className="h-3 w-3/4 rounded bg-white/5" />
													</td>
													<td className="hidden px-4 py-5 md:table-cell">
														<div className="h-3 w-2/3 rounded bg-white/5" />
													</td>
													<td className="sticky right-0 bg-background/95 px-3 py-5">
														<div className="mx-auto h-8 w-8 rounded-md bg-white/5" />
													</td>
												</tr>
											))}
									</tbody>
								</table>
							</div>
						</div>

						<div className="flex flex-col items-center gap-4 pb-6 pt-2">
							<Button
								onClick={handleProceed}
								disabled={researchStatus !== "ready" || isProceeding || streamingState.isStreaming}
								className="group h-11 rounded-md border border-white/20 bg-white/10 px-6 text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<span className="flex items-center gap-2 text-sm font-semibold">
									{isProceeding ? (
										<>
											<Spinner />
											Processing...
										</>
									) : (
										<>
											<Sparkles className="h-4 w-4 opacity-80" />
											Proceed to Generate
										</>
									)}
								</span>
							</Button>
							<p className="text-center text-sm text-white/45">
								Press <span className="text-white/50">Enter</span> to generate
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
