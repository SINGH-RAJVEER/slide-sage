import type { AIModelSelection } from "@slidesage/types";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { API_URL, readJsonResponse } from "../lib/api";
import { publishPresentationUpdated } from "../lib/presentation-events";
import type {
	PresentationData,
	PresentationGenerationStage,
	PresentationOutline,
	ResearchPayload,
	Slide,
	Source,
	ThemeId,
} from "../types/presentation";

export interface StreamingState {
	isStreaming: boolean;
	slides: Slide[];
	theme: string;
	title: string;
	totalSlides: number;
	requestedSlides: number;
	operation?: "generation" | "iteration";
	prompt?: string;
	presentationId?: string;
	error?: string;
	isComplete: boolean;
	researchSources?: Source[];
	researchStatus?: "idle" | "searching" | "ready" | "generating";
	generationStage?: PresentationGenerationStage;
	generationMessage?: string;
	generationProgress?: { completed: number; total: number };
	outline?: PresentationOutline;
	completedDocument?: PresentationData;
}

type ResearchPreviewStatus = "idle" | "loading" | "ready" | "error";

interface ResearchPreviewRequest {
	prompt: string;
	slideCount: number;
	detailLevel: string;
	tonality: string;
}

interface ResearchPreviewState extends ResearchPreviewRequest {
	status: ResearchPreviewStatus;
	sources: Source[];
	estimatedTokens: number | null;
	error?: string;
	requestKey?: string;
}

interface StreamingContextValue {
	streamingState: StreamingState;
	researchPreviewState: ResearchPreviewState;
	startResearchPreview: (
		request: ResearchPreviewRequest,
		savedResearch?: ResearchPayload,
		forceRefresh?: boolean,
	) => Promise<boolean>;
	startStreaming: (
		prompt: string,
		slideCount: number,
		detailLevel: string,
		tonality: string,
		researchEnabled?: boolean,
		researchPayload?: ResearchPayload,
		retryPresentationId?: string,
		theme?: ThemeId,
		ai?: AIModelSelection,
	) => Promise<boolean>;
	startIterating: (
		prompt: string,
		parentPresentationId: string,
		slideCount: number,
		detailLevel: string,
		tonality: string,
		researchEnabled?: boolean,
	) => Promise<boolean>;
	stopStreaming: () => void;
	resetStreaming: () => void;
	getPresentation: () => PresentationData | null;
}

const initialState: StreamingState = {
	isStreaming: false,
	slides: [],
	theme: "corporate-blue",
	title: "Untitled Presentation",
	totalSlides: 0,
	requestedSlides: 0,
	isComplete: false,
	researchSources: undefined,
	researchStatus: "idle",
};

const initialResearchPreviewState: ResearchPreviewState = {
	status: "idle",
	prompt: "",
	slideCount: 0,
	detailLevel: "balanced",
	tonality: "professional",
	sources: [],
	estimatedTokens: null,
};

const StreamingContext = createContext<StreamingContextValue | null>(null);

function getResearchPreviewKey(request: ResearchPreviewRequest) {
	return [request.prompt.trim(), request.slideCount, request.detailLevel, request.tonality].join(
		"\u001f",
	);
}

function publishPointsBalance(slideTokens: unknown) {
	if (typeof slideTokens !== "number" || !Number.isFinite(slideTokens)) return;
	window.dispatchEvent(
		new CustomEvent("slidesage:points-updated", {
			detail: { slideTokens },
		}),
	);
}

async function fetchPersistedPresentation(
	presentationId: string,
): Promise<PresentationData | null> {
	const response = await fetch(`${API_URL}/presentations/${presentationId}`, {
		credentials: "include",
	});
	if (!response.ok) return null;
	const data = (await response.json().catch(() => null)) as {
		presentation?: { slides_data?: PresentationData };
	} | null;
	return data?.presentation?.slides_data ?? null;
}

export function StreamingProvider({ children }: { children: ReactNode }) {
	const [streamingState, setStreamingState] = useState<StreamingState>(initialState);
	const [researchPreviewState, setResearchPreviewState] = useState<ResearchPreviewState>(
		initialResearchPreviewState,
	);
	const abortControllerRef = useRef<AbortController | null>(null);
	const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
	const activeStreamRef = useRef(false);
	const researchAbortControllerRef = useRef<AbortController | null>(null);
	const researchRequestIdRef = useRef(0);
	const researchPreviewStateRef = useRef<ResearchPreviewState>(initialResearchPreviewState);

	const updateResearchPreviewState = useCallback(
		(next: ResearchPreviewState | ((previous: ResearchPreviewState) => ResearchPreviewState)) => {
			setResearchPreviewState((previous) => {
				const resolved = typeof next === "function" ? next(previous) : next;
				researchPreviewStateRef.current = resolved;
				return resolved;
			});
		},
		[],
	);

	const releaseActiveStream = useCallback(() => {
		activeStreamRef.current = false;
		abortControllerRef.current = null;
		readerRef.current = null;
	}, []);

	const resetStreaming = useCallback(() => {
		if (activeStreamRef.current) return;
		setStreamingState(initialState);
	}, []);

	const stopStreaming = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		if (readerRef.current) {
			void readerRef.current.cancel();
			readerRef.current = null;
		}
		releaseActiveStream();
		setStreamingState((prev) => ({ ...prev, isStreaming: false, isComplete: false }));
	}, [releaseActiveStream]);

	const startResearchPreview = useCallback(
		async (
			request: ResearchPreviewRequest,
			savedResearch?: ResearchPayload,
			forceRefresh = false,
		): Promise<boolean> => {
			const requestKey = getResearchPreviewKey(request);
			const current = researchPreviewStateRef.current;

			if (
				!forceRefresh &&
				current.requestKey === requestKey &&
				(current.status === "loading" || current.status === "ready")
			) {
				return current.status === "ready";
			}

			researchRequestIdRef.current += 1;
			const requestId = researchRequestIdRef.current;
			researchAbortControllerRef.current?.abort();
			researchAbortControllerRef.current = null;

			if (savedResearch && !forceRefresh) {
				updateResearchPreviewState({
					...request,
					status: "ready",
					sources: savedResearch.sources,
					estimatedTokens:
						typeof savedResearch.estimated_tokens === "number"
							? savedResearch.estimated_tokens
							: null,
					requestKey,
				});
				return true;
			}

			const controller = new AbortController();
			researchAbortControllerRef.current = controller;
			updateResearchPreviewState({
				...request,
				status: "loading",
				sources: [],
				estimatedTokens: null,
				error: undefined,
				requestKey,
			});

			try {
				const response = await fetch(`${API_URL}/research-presentation`, {
					method: "POST",
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						topic: request.prompt,
						research: {
							enabled: true,
						},
						slide_count: request.slideCount,
						detail_level: request.detailLevel,
						tonality: request.tonality,
					}),
					signal: controller.signal,
				});

				if (controller.signal.aborted || requestId !== researchRequestIdRef.current) {
					return false;
				}

				if (!response.ok) {
					const errorData = await readJsonResponse<{
						error?: string | { message?: string };
						message?: string;
					}>(response);
					const errorMessage =
						typeof errorData?.error === "string"
							? errorData.error
							: errorData?.error?.message || errorData?.message || "Failed to fetch research";

					updateResearchPreviewState((previous) => ({
						...previous,
						status: "error",
						error: errorMessage,
					}));
					return false;
				}

				const data = await readJsonResponse<ResearchPayload>(response);
				if (controller.signal.aborted || requestId !== researchRequestIdRef.current) {
					return false;
				}

				if (!data) {
					updateResearchPreviewState((previous) => ({
						...previous,
						status: "error",
						error: "The research service returned an invalid response.",
					}));
					return false;
				}

				updateResearchPreviewState({
					...request,
					status: "ready",
					sources: Array.isArray(data.sources) ? data.sources : [],
					estimatedTokens: typeof data.estimated_tokens === "number" ? data.estimated_tokens : null,
					requestKey,
				});
				return true;
			} catch (err: unknown) {
				const isAbort = err instanceof Error && err.name === "AbortError";
				if (isAbort || controller.signal.aborted || requestId !== researchRequestIdRef.current) {
					return false;
				}

				const message = err instanceof Error ? err.message : String(err);
				updateResearchPreviewState((previous) => ({
					...previous,
					status: "error",
					error: message,
				}));
				return false;
			} finally {
				if (requestId === researchRequestIdRef.current) {
					researchAbortControllerRef.current = null;
				}
			}
		},
		[updateResearchPreviewState],
	);

	const getPresentation = useCallback((): PresentationData | null => {
		if (streamingState.slides.length === 0) return null;
		return {
			...streamingState.completedDocument,
			title: streamingState.title,
			theme: streamingState.theme,
			slides: streamingState.slides,
			totalSlides: streamingState.slides.length,
		};
	}, [streamingState]);

	const startStreaming = useCallback(
		async (
			prompt: string,
			slideCount: number,
			detailLevel: string,
			tonality: string,
			researchEnabled = false,
			researchPayload?: ResearchPayload,
			retryPresentationId?: string,
			theme: ThemeId = "corporate-blue",
			ai?: AIModelSelection,
		): Promise<boolean> => {
			if (activeStreamRef.current) return false;
			activeStreamRef.current = true;

			// Reset state
			setStreamingState({
				...initialState,
				isStreaming: true,
				requestedSlides: slideCount,
				operation: "generation",
				prompt,
				theme,
				presentationId: retryPresentationId,
				researchStatus: researchEnabled && !researchPayload ? "searching" : "idle",
			});

			abortControllerRef.current = new AbortController();

			try {
				const response = await fetch(`${API_URL}/generate-presentation-stream`, {
					method: "POST",
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						topic: prompt,
						slide_count: slideCount,
						detail_level: detailLevel,
						tonality,
						research: {
							enabled: Boolean(researchEnabled),
						},
						research_payload: researchPayload,
						retry_presentation_id: retryPresentationId,
						theme,
						ai,
					}),
					signal: abortControllerRef.current.signal,
				});

				// Handle 401 Unauthorized - token might be expired
				if (response.status === 401) {
					releaseActiveStream();
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: "Session expired. Please log in again.",
					}));
					return false;
				}

				if (response.status === 422) {
					releaseActiveStream();
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: "Your session is invalid. Please log out and log in again.",
					}));
					return false;
				}

				if (response.status === 402) {
					const errorData = await readJsonResponse<{
						slide_tokens_remaining?: number;
						slide_tokens_required?: number;
					}>(response);
					releaseActiveStream();
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: `Insufficient points. You have ${
							errorData?.slide_tokens_remaining?.toFixed(1) || 0
						} points, but need at least ${errorData?.slide_tokens_required || 1} to generate.`,
					}));
					return false;
				}

				if (!response.ok) {
					const errorData = await readJsonResponse<{
						error?: string | { message?: string };
						message?: string;
					}>(response);
					const errorMessage =
						typeof errorData?.error === "string"
							? errorData.error
							: errorData?.error?.message ||
								errorData?.message ||
								`Presentation service request failed (${response.status}).`;

					releaseActiveStream();
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: errorMessage,
					}));
					return false;
				}

				const reader = response.body?.getReader();
				if (!reader) {
					releaseActiveStream();
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: "Failed to read streaming response",
					}));
					return false;
				}

				readerRef.current = reader;
				const decoder = new TextDecoder();
				let buffer = "";
				let currentEvent = ""; // Persist across reads
				let receivedComplete = false;
				let receivedError = false;
				let receivedSaved = false;
				let streamedPresentationId = retryPresentationId;
				let completedData: PresentationData | null = null;

				const processStream = async () => {
					try {
						while (true) {
							const { done, value } = await reader.read();
							if (done) break;

							buffer += decoder.decode(value, { stream: true });
							const lines = buffer.split("\n");
							buffer = lines.pop() || "";

							for (const line of lines) {
								if (line.startsWith("event: ")) {
									currentEvent = line.slice(7).trim();
								} else if (line.startsWith("data: ") && currentEvent) {
									const dataStr = line.slice(6);
									try {
										const data = JSON.parse(dataStr);

										switch (currentEvent) {
											case "start":
												setStreamingState((prev) => ({
													...prev,
													researchStatus:
														prev.researchStatus && prev.researchStatus !== "idle"
															? "generating"
															: prev.researchStatus,
												}));
												break;

											case "research":
												setStreamingState((prev) => ({
													...prev,
													researchStatus: data.status || prev.researchStatus,
													researchSources: data.sources ?? prev.researchSources,
												}));
												break;

											case "stage":
												setStreamingState((prev) => ({
													...prev,
													generationStage: data.stage,
													generationMessage: data.message,
													generationProgress: {
														completed: data.completed,
														total: data.total,
													},
												}));
												break;

											case "outline":
												setStreamingState((prev) => ({
													...prev,
													outline: data,
													title: data.title || prev.title,
												}));
												break;

											case "created":
												streamedPresentationId = data.presentation_id;
												// Presentation record created - store the ID immediately
												setStreamingState((prev) => ({
													...prev,
													presentationId: data.presentation_id,
												}));
												break;

											case "theme":
												setStreamingState((prev) => ({
													...prev,
													theme: data.theme,
												}));
												break;

											case "retry":
												setStreamingState((prev) => ({
													...prev,
													slides: [],
													theme: "corporate-blue",
													title: "Untitled Presentation",
													totalSlides: 0,
													isComplete: false,
													error: undefined,
												}));
												break;

											case "slide":
												setStreamingState((prev) => {
													const newSlides = [...prev.slides];
													const index = Number(data.index);
													if (Number.isInteger(index) && index >= 0) {
														newSlides[index] = data.slide;
													} else {
														const existingIndex = newSlides.findIndex(
															(slide) => slide.id === data.slide.id,
														);
														if (existingIndex >= 0) {
															newSlides[existingIndex] = data.slide;
														} else {
															newSlides.push(data.slide);
														}
													}
													console.log(
														"Adding slide",
														data.slide.id,
														"Total slides:",
														newSlides.length,
													);
													return {
														...prev,
														slides: newSlides,
														title: data.title || prev.title,
														totalSlides: newSlides.length,
													};
												});
												break;

											case "complete":
												receivedComplete = true;
												completedData = data as PresentationData;
												setStreamingState((prev) => ({
													...prev,
													completedDocument: data,
													isComplete: receivedSaved,
													theme: data.theme || prev.theme,
													title: data.title || prev.title,
													slides: data.slides || prev.slides,
													totalSlides:
														data.totalSlides ||
														(data.slides ? data.slides.length : prev.slides.length),
												}));
												break;

											case "saved":
												receivedSaved = true;
												// Final save confirmation - update presentation ID if provided
												setStreamingState((prev) => ({
													...prev,
													isComplete: receivedComplete,
													presentationId: data.presentation_id || prev.presentationId,
												}));
												console.log("Presentation saved:", data.presentation_id);
												publishPresentationUpdated(data.presentation_id);
												publishPointsBalance(data.slide_tokens_remaining);
												break;

											case "save_error":
												console.error("Save error:", data.error);
												// Don't set streaming to false, just log the error
												break;

											case "error":
												receivedError = true;
												if (data.presentation_id) {
													publishPresentationUpdated(data.presentation_id);
												}
												setStreamingState((prev) => ({
													...prev,
													isStreaming: false,
													isComplete: false,
													error: data.error,
													researchStatus: "idle",
												}));
												return;
										}

										// Reset event after processing
										currentEvent = "";
									} catch (parseErr) {
										console.error("Failed to parse SSE data:", parseErr);
									}
								}
							}
						}

						if (!receivedComplete || !receivedSaved || receivedError) {
							if (!receivedError) {
								const persisted = streamedPresentationId
									? await fetchPersistedPresentation(streamedPresentationId).catch(() => null)
									: null;
								const persistedSlides = persisted?.slides ?? [];
								const generatedSlides = completedData?.slides ?? [];
								if (
									persisted &&
									(persisted as (PresentationData & { status?: string }) | null)?.status ===
										"ready" &&
									persistedSlides.length > 0 &&
									JSON.stringify(persistedSlides) === JSON.stringify(generatedSlides)
								) {
									setStreamingState((prev) => ({
										...prev,
										...persisted,
										completedDocument: persisted,
										presentationId: streamedPresentationId,
										slides: persistedSlides,
										totalSlides: persistedSlides.length,
										isStreaming: false,
										isComplete: true,
										error: undefined,
									}));
									publishPresentationUpdated(streamedPresentationId);
									return;
								}
								setStreamingState((prev) => ({
									...prev,
									isStreaming: false,
									isComplete: false,
									error: "Generation stream ended before the presentation was completed.",
								}));
							}
							return;
						}

						setStreamingState((prev) => ({
							...prev,
							isStreaming: false,
							isComplete: true,
							researchStatus: prev.researchStatus === "generating" ? "ready" : prev.researchStatus,
						}));
					} catch (streamErr: unknown) {
						const isAbort = streamErr instanceof Error && streamErr.name === "AbortError";
						if (!isAbort) {
							console.error("Stream error:", streamErr);
							const message = streamErr instanceof Error ? streamErr.message : String(streamErr);
							setStreamingState((prev) => ({
								...prev,
								isStreaming: false,
								isComplete: false,
								error: `Streaming error: ${message}`,
							}));
						}
					} finally {
						releaseActiveStream();
					}
				};

				// Start processing the stream in the background
				processStream();
				return true;
			} catch (err: unknown) {
				releaseActiveStream();
				const isAbort = err instanceof Error && err.name === "AbortError";
				if (!isAbort) {
					const message = err instanceof Error ? err.message : String(err);
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: `Error: ${message}`,
					}));
				}
				return false;
			}
		},
		[releaseActiveStream],
	);

	const startIterating = useCallback(
		async (
			prompt: string,
			parentPresentationId: string,
			slideCount: number,
			detailLevel: string,
			tonality: string,
			researchEnabled = false,
		): Promise<boolean> => {
			if (activeStreamRef.current) return false;
			activeStreamRef.current = true;

			// Reset state
			setStreamingState({
				...initialState,
				isStreaming: true,
				requestedSlides: slideCount,
				operation: "iteration",
				prompt,
				presentationId: parentPresentationId,
				researchStatus: researchEnabled ? "searching" : "idle",
			});

			abortControllerRef.current = new AbortController();

			try {
				const response = await fetch(`${API_URL}/iterate-presentation-stream`, {
					method: "POST",
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						topic: prompt,
						parent_presentation_id: parentPresentationId,
						slide_count: slideCount,
						detail_level: detailLevel,
						tonality,
						research: {
							enabled: Boolean(researchEnabled),
						},
					}),
					signal: abortControllerRef.current.signal,
				});

				// Handle 401 Unauthorized - token might be expired
				if (response.status === 401) {
					releaseActiveStream();
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: "Session expired. Please log in again.",
					}));
					return false;
				}

				if (response.status === 422) {
					releaseActiveStream();
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: "Your session is invalid. Please log out and log in again.",
					}));
					return false;
				}

				if (response.status === 402) {
					const errorData = await readJsonResponse<{
						slide_tokens_remaining?: number;
						slide_tokens_required?: number;
					}>(response);
					releaseActiveStream();
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: `Insufficient points. You have ${
							errorData?.slide_tokens_remaining?.toFixed(1) || 0
						} points, but need at least ${errorData?.slide_tokens_required || 1} to iterate.`,
					}));
					return false;
				}

				if (!response.ok) {
					const errorData = await readJsonResponse<{
						error?: string | { message?: string };
						message?: string;
					}>(response);
					const errorMessage =
						typeof errorData?.error === "string"
							? errorData.error
							: errorData?.error?.message ||
								errorData?.message ||
								`Presentation service request failed (${response.status}).`;
					releaseActiveStream();
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: errorMessage,
					}));
					return false;
				}

				const reader = response.body?.getReader();
				if (!reader) {
					releaseActiveStream();
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: "Failed to read streaming response",
					}));
					return false;
				}

				readerRef.current = reader;
				const decoder = new TextDecoder();
				let buffer = "";
				let currentEvent = ""; // Persist across reads
				let receivedComplete = false;
				let receivedError = false;
				let receivedSaved = false;
				let completedData: PresentationData | null = null;

				const processStream = async () => {
					try {
						while (true) {
							const { done, value } = await reader.read();
							if (done) break;

							buffer += decoder.decode(value, { stream: true });
							const lines = buffer.split("\n");
							buffer = lines.pop() || "";

							for (const line of lines) {
								if (line.startsWith("event: ")) {
									currentEvent = line.slice(7).trim();
								} else if (line.startsWith("data: ") && currentEvent) {
									const dataStr = line.slice(6);
									try {
										const data = JSON.parse(dataStr);

										switch (currentEvent) {
											case "start":
												setStreamingState((prev) => ({
													...prev,
													researchStatus:
														prev.researchStatus && prev.researchStatus !== "idle"
															? "generating"
															: prev.researchStatus,
												}));
												break;

											case "research":
												setStreamingState((prev) => ({
													...prev,
													researchStatus: data.status || prev.researchStatus,
													researchSources: data.sources ?? prev.researchSources,
												}));
												break;

											case "stage":
												setStreamingState((prev) => ({
													...prev,
													generationStage: data.stage,
													generationMessage: data.message,
													generationProgress: {
														completed: data.completed,
														total: data.total,
													},
												}));
												break;

											case "outline":
												setStreamingState((prev) => ({
													...prev,
													outline: data,
													title: data.title || prev.title,
												}));
												break;

											case "theme":
												setStreamingState((prev) => ({
													...prev,
													theme: data.theme,
												}));
												break;

											case "retry":
												setStreamingState((prev) => ({
													...prev,
													slides: [],
													theme: "corporate-blue",
													title: "Updated Presentation",
													totalSlides: 0,
													isComplete: false,
													error: undefined,
												}));
												break;

											case "slide":
												setStreamingState((prev) => {
													const newSlides = [...prev.slides];
													const index = Number(data.index);
													if (Number.isInteger(index) && index >= 0) {
														newSlides[index] = data.slide;
													} else {
														const existingIndex = newSlides.findIndex(
															(slide) => slide.id === data.slide.id,
														);
														if (existingIndex >= 0) {
															newSlides[existingIndex] = data.slide;
														} else {
															newSlides.push(data.slide);
														}
													}
													console.log(
														"Adding slide",
														data.slide.id,
														"Total slides:",
														newSlides.length,
													);
													return {
														...prev,
														slides: newSlides,
														title: data.title || prev.title,
														totalSlides: newSlides.length,
													};
												});
												break;

											case "complete":
												receivedComplete = true;
												completedData = data as PresentationData;
												setStreamingState((prev) => ({
													...prev,
													completedDocument: data,
													isComplete: receivedSaved,
													theme: data.theme || prev.theme,
													title: data.title || prev.title,
													// Use complete slides data if available to ensure consistency
													slides: data.slides || prev.slides,
													totalSlides:
														data.totalSlides ||
														(data.slides ? data.slides.length : prev.slides.length),
												}));
												break;

											case "saved":
												receivedSaved = true;
												// Iteration saved - presentation updated in place
												setStreamingState((prev) => ({
													...prev,
													isComplete: receivedComplete,
													presentationId: data.presentation_id || prev.presentationId,
												}));
												console.log("Iteration saved to presentation:", data.presentation_id);
												publishPresentationUpdated(data.presentation_id || parentPresentationId);
												publishPointsBalance(data.slide_tokens_remaining);
												break;

											case "save_error":
												console.error("Save error during iteration:", data.error);
												break;

											case "error":
												receivedError = true;
												setStreamingState((prev) => ({
													...prev,
													isStreaming: false,
													isComplete: false,
													error: data.error,
													researchStatus: "idle",
												}));
												return;
										}

										// Reset event after processing
										currentEvent = "";
									} catch (parseErr) {
										console.error("Failed to parse SSE data:", parseErr);
									}
								}
							}
						}

						if (!receivedComplete || !receivedSaved || receivedError) {
							if (!receivedError) {
								const persisted = await fetchPersistedPresentation(parentPresentationId).catch(
									() => null,
								);
								const persistedSlides = persisted?.slides ?? [];
								const generatedSlides = completedData?.slides ?? [];
								if (
									persisted &&
									(persisted as (PresentationData & { status?: string }) | null)?.status ===
										"ready" &&
									persistedSlides.length > 0 &&
									JSON.stringify(persistedSlides) === JSON.stringify(generatedSlides)
								) {
									setStreamingState((prev) => ({
										...prev,
										...persisted,
										completedDocument: persisted,
										presentationId: parentPresentationId,
										slides: persistedSlides,
										totalSlides: persistedSlides.length,
										isStreaming: false,
										isComplete: true,
										error: undefined,
									}));
									publishPresentationUpdated(parentPresentationId);
									return;
								}
								setStreamingState((prev) => ({
									...prev,
									isStreaming: false,
									isComplete: false,
									error: "Update stream ended before the presentation was completed.",
								}));
							}
							return;
						}

						setStreamingState((prev) => ({
							...prev,
							isStreaming: false,
							isComplete: true,
							researchStatus: prev.researchStatus === "generating" ? "ready" : prev.researchStatus,
						}));
					} catch (streamErr: unknown) {
						const isAbort = streamErr instanceof Error && streamErr.name === "AbortError";
						if (!isAbort) {
							console.error("Stream error:", streamErr);
							const message = streamErr instanceof Error ? streamErr.message : String(streamErr);
							setStreamingState((prev) => ({
								...prev,
								isStreaming: false,
								isComplete: false,
								error: `Streaming error: ${message}`,
							}));
						}
					} finally {
						releaseActiveStream();
					}
				};

				// Start processing the stream in the background
				processStream();
				return true;
			} catch (err: unknown) {
				releaseActiveStream();
				const isAbort = err instanceof Error && err.name === "AbortError";
				if (!isAbort) {
					const message = err instanceof Error ? err.message : String(err);
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: `Error: ${message}`,
					}));
				}
				return false;
			}
		},
		[releaseActiveStream],
	);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			stopStreaming();
			researchAbortControllerRef.current?.abort();
		};
	}, [stopStreaming]);

	return (
		<StreamingContext.Provider
			value={{
				streamingState,
				researchPreviewState,
				startResearchPreview,
				startStreaming,
				startIterating,
				stopStreaming,
				resetStreaming,
				getPresentation,
			}}
		>
			{children}
		</StreamingContext.Provider>
	);
}

export function useStreaming() {
	const context = useContext(StreamingContext);
	if (!context) {
		throw new Error("useStreaming must be used within a StreamingProvider");
	}
	return context;
}
