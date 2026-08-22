import type {
	AIModelSelection,
	DeckPlan,
	PresentationData,
	PresentationGenerationStage,
	PresentationOutline,
	ResearchPayload,
	Slide,
	Source,
	ThemeId,
} from "@slidesage/types";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { API_URL, readJsonResponse } from "../lib/api";
import { publishPointsBalance } from "../lib/points";
import { publishPresentationUpdated } from "../lib/presentation-events";
import { consumeSSEStream } from "../lib/sse-stream";

const ACTIVE_GENERATION_KEY = "slidesage-active-generation";

function idempotencyKey() {
	return crypto.randomUUID();
}

interface StoredGeneration {
	jobId: string;
	idempotencyKey?: string;
	presentationId: string;
	operation: "generation" | "iteration";
	prompt?: string;
	requestedSlides: number;
	theme: string;
	lastEventId: number;
}

let inMemoryGeneration: StoredGeneration | null = null;
let generationStorageUnavailable = false;

function readStoredGeneration(): StoredGeneration | null {
	if (typeof window === "undefined") return inMemoryGeneration;
	if (generationStorageUnavailable) return inMemoryGeneration;
	try {
		const raw = window.localStorage.getItem(ACTIVE_GENERATION_KEY);
		if (!raw) {
			if (generationStorageUnavailable) return inMemoryGeneration;
			inMemoryGeneration = null;
			return null;
		}
		generationStorageUnavailable = false;
		const value = JSON.parse(raw);
		if (
			!value ||
			typeof value.jobId !== "string" ||
			typeof value.presentationId !== "string" ||
			(value.operation !== "generation" && value.operation !== "iteration") ||
			typeof value.requestedSlides !== "number" ||
			typeof value.theme !== "string" ||
			typeof value.lastEventId !== "number"
		) {
			inMemoryGeneration = null;
			window.localStorage.removeItem(ACTIVE_GENERATION_KEY);
			return null;
		}
		inMemoryGeneration = value as StoredGeneration;
		return inMemoryGeneration;
	} catch {
		generationStorageUnavailable = true;
		return inMemoryGeneration;
	}
}

function storeGeneration(value: StoredGeneration | null) {
	inMemoryGeneration = value;
	if (typeof window === "undefined") return;
	try {
		if (value) {
			window.localStorage.setItem(ACTIVE_GENERATION_KEY, JSON.stringify(value));
		} else {
			window.localStorage.removeItem(ACTIVE_GENERATION_KEY);
		}
		generationStorageUnavailable = false;
	} catch {
		generationStorageUnavailable = true;
		// Streaming continues in-memory when browser storage is unavailable.
	}
}

function clearStoredGeneration(jobId: string) {
	const stored = readStoredGeneration();
	if (!stored || stored.jobId === jobId) storeGeneration(null);
}

export interface StreamingState {
	isStreaming: boolean;
	slides: Slide[];
	theme: string;
	title: string;
	totalSlides: number;
	requestedSlides: number;
	operation?: "generation" | "iteration";
	jobId?: string;
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
	deckPlan?: DeckPlan;
	completedDocument?: PresentationData;
}

type ResearchPreviewStatus = "idle" | "loading" | "ready" | "error";

interface ResearchEventPayload {
	status?: StreamingState["researchStatus"];
	sources?: Source[];
}

interface StageEventPayload {
	stage?: PresentationGenerationStage;
	message?: string;
	completed?: number;
	total?: number;
}

interface SlideEventPayload {
	index?: number;
	slide: Slide;
	title?: string;
}

interface CreatedEventPayload {
	job_id?: string;
	presentation_id: string;
}

interface SavedEventPayload {
	presentation_id?: string;
	slide_tokens_remaining?: number;
}

interface ErrorEventPayload {
	error?: string;
	presentation_id?: string;
}

interface ThemeEventPayload {
	theme: string;
}

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

async function fetchPersistedPresentation(
	presentationId: string,
	signal?: AbortSignal,
): Promise<PresentationData | null> {
	const response = await fetch(`${API_URL}/presentations/${presentationId}`, {
		credentials: "include",
		signal,
	});
	if (!response.ok) return null;
	const data = (await response.json().catch(() => null)) as {
		presentation?: { slides_data?: PresentationData };
	} | null;
	return data?.presentation?.slides_data ?? null;
}

function waitForRetry(delay: number, signal: AbortSignal) {
	return new Promise<void>((resolve) => {
		const timeout = window.setTimeout(resolve, delay);
		signal.addEventListener(
			"abort",
			() => {
				window.clearTimeout(timeout);
				resolve();
			},
			{ once: true },
		);
	});
}

export function StreamingProvider({ children }: { children: ReactNode }) {
	const [streamingState, setStreamingState] = useState<StreamingState>(initialState);
	const [reconnectVersion, setReconnectVersion] = useState(0);
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

	// Shared SSE event appliers used by the generation, iteration, and resume
	// stream loops so every path updates state identically.
	const applyStartEvent = () => {
		setStreamingState((prev) => ({
			...prev,
			researchStatus:
				prev.researchStatus && prev.researchStatus !== "idle" ? "generating" : prev.researchStatus,
		}));
	};

	const applyResearchEvent = (data: ResearchEventPayload) => {
		setStreamingState((prev) => ({
			...prev,
			researchStatus: data.status || prev.researchStatus,
			researchSources: data.sources ?? prev.researchSources,
		}));
	};

	const applyStageEvent = (data: StageEventPayload) => {
		setStreamingState((prev) => ({
			...prev,
			generationStage: data.stage,
			generationMessage: data.message,
			generationProgress: { completed: data.completed ?? 0, total: data.total ?? 0 },
		}));
	};

	const applyOutlineEvent = (data: PresentationOutline) => {
		setStreamingState((prev) => ({ ...prev, outline: data, title: data.title || prev.title }));
	};

	const applyPlanEvent = (data: DeckPlan) => {
		setStreamingState((prev) => ({ ...prev, deckPlan: data, title: data.title || prev.title }));
	};

	const applyThemeEvent = (data: ThemeEventPayload) => {
		setStreamingState((prev) => ({ ...prev, theme: data.theme }));
	};

	const applyRetryEvent = (title: string) => {
		setStreamingState((prev) => ({
			...prev,
			slides: [],
			theme: "corporate-blue",
			title,
			totalSlides: 0,
			isComplete: false,
			error: undefined,
		}));
	};

	const applySlideEvent = (data: SlideEventPayload) => {
		setStreamingState((prev) => {
			const slides = [...prev.slides];
			const index = Number(data.index);
			if (Number.isInteger(index) && index >= 0) {
				slides[index] = data.slide;
			} else {
				const existingIndex = slides.findIndex((slide) => slide.id === data.slide.id);
				if (existingIndex >= 0) {
					slides[existingIndex] = data.slide;
				} else {
					slides.push(data.slide);
				}
			}
			return {
				...prev,
				slides,
				title: data.title || prev.title,
				totalSlides: slides.length,
			};
		});
	};

	const applyCompleteEvent = (data: PresentationData) => {
		setStreamingState((prev) => ({
			...prev,
			completedDocument: data,
			theme: data.theme || prev.theme,
			title: data.title || prev.title,
			slides: data.slides || prev.slides,
			totalSlides:
				data.totalSlides || (data.slides ? data.slides.length : prev.slides.length),
		}));
	};

	const releaseActiveStream = useCallback((owner?: AbortController) => {
		if (owner && abortControllerRef.current !== owner) return;
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
						"Idempotency-Key": idempotencyKey(),
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
						slide_tokens_remaining?: number;
					}>(response);
					publishPointsBalance(errorData?.slide_tokens_remaining);
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

				const data = await readJsonResponse<ResearchPayload & { slide_tokens_remaining?: number }>(
					response,
				);
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
				publishPointsBalance(data.slide_tokens_remaining);

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
			deckPlan: streamingState.deckPlan ?? streamingState.completedDocument?.deckPlan,
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
			const requestIdempotencyKey = idempotencyKey();

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

			const controller = new AbortController();
			abortControllerRef.current = controller;
			storeGeneration({
				jobId: "",
				idempotencyKey: requestIdempotencyKey,
				presentationId: retryPresentationId || "",
				operation: "generation",
				prompt,
				requestedSlides: slideCount,
				theme,
				lastEventId: 0,
			});

			try {
				const response = await fetch(`${API_URL}/generate-presentation-stream`, {
					method: "POST",
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
						"Idempotency-Key": requestIdempotencyKey,
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
					signal: controller.signal,
				});

				// Handle 401 Unauthorized - token might be expired
				if (response.status === 401) {
					clearStoredGeneration("");
					releaseActiveStream(controller);
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: "Session expired. Please log in again.",
					}));
					return false;
				}

				if (response.status === 422) {
					clearStoredGeneration("");
					releaseActiveStream(controller);
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
					publishPointsBalance(errorData?.slide_tokens_remaining);
					clearStoredGeneration("");
					releaseActiveStream(controller);
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: `Insufficient points. You have ${
							errorData?.slide_tokens_remaining?.toFixed(1) || 0
						} points, but need at least ${errorData?.slide_tokens_required || 1} to generate.`,
					}));
					return false;
				}
				if (response.status >= 500) {
					releaseActiveStream(controller);
					setStreamingState((previous) => ({
						...previous,
						isStreaming: true,
						error: undefined,
						generationMessage: "Confirming generation submission",
					}));
					setReconnectVersion((version) => version + 1);
					return true;
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

					clearStoredGeneration("");
					releaseActiveStream(controller);
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: errorMessage,
					}));
					return false;
				}
				const responseJobId = response.headers.get("X-Generation-Job-ID") || undefined;
				const responsePresentationId =
					response.headers.get("X-Presentation-ID") || retryPresentationId;
				if (!responseJobId) clearStoredGeneration("");
				if (responseJobId && responsePresentationId) {
					storeGeneration({
						jobId: responseJobId,
						idempotencyKey: requestIdempotencyKey,
						presentationId: responsePresentationId,
						operation: "generation",
						prompt,
						requestedSlides: slideCount,
						theme,
						lastEventId: 0,
					});
					setStreamingState((previous) => ({
						...previous,
						jobId: responseJobId,
						presentationId: responsePresentationId,
					}));
				}

				const reader = response.body?.getReader();
				if (!reader) {
					if (responseJobId) {
						releaseActiveStream(controller);
						setReconnectVersion((version) => version + 1);
						return true;
					}
					releaseActiveStream(controller);
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: "Failed to read streaming response",
					}));
					return false;
				}

				readerRef.current = reader;
				let streamedPresentationId = responsePresentationId;
				let streamedJobId = responseJobId;
				let receivedComplete = false;
				let completedData: PresentationData | null = null;

				const processStream = async () => {
					try {
						await consumeSSEStream(reader, ({ event, id, data }) => {
							switch (event) {
								case "start":
									applyStartEvent();
									break;

								case "research":
									applyResearchEvent(data as ResearchEventPayload);
									break;

								case "stage":
									applyStageEvent(data as StageEventPayload);
									break;

								case "outline":
									applyOutlineEvent(data as PresentationOutline);
									break;

								case "plan":
									applyPlanEvent(data as DeckPlan);
									break;

								case "created": {
									const payload = data as CreatedEventPayload;
									streamedPresentationId = payload.presentation_id;
									streamedJobId = payload.job_id;
									if (streamedJobId) {
										storeGeneration({
											jobId: streamedJobId,
											idempotencyKey: requestIdempotencyKey,
											presentationId: payload.presentation_id,
											operation: "generation",
											prompt,
											requestedSlides: slideCount,
											theme,
											lastEventId: id,
										});
									}
									// Presentation record created - store the ID immediately
									setStreamingState((prev) => ({
										...prev,
										jobId: payload.job_id,
										presentationId: payload.presentation_id,
									}));
									break;
								}

								case "theme":
									applyThemeEvent(data as ThemeEventPayload);
									break;

								case "retry":
									applyRetryEvent("Untitled Presentation");
									break;

								case "slide":
									applySlideEvent(data as SlideEventPayload);
									break;

								case "complete":
									receivedComplete = true;
									completedData = data as PresentationData;
									applyCompleteEvent(completedData);
									break;

								case "saved": {
									const payload = data as SavedEventPayload;
									clearStoredGeneration(streamedJobId || "");
									// Final save confirmation - update presentation ID if provided
									setStreamingState((prev) => ({
										...prev,
										isStreaming: false,
										isComplete: true,
										presentationId: payload.presentation_id || prev.presentationId,
										researchStatus:
											prev.researchStatus === "generating" ? "ready" : prev.researchStatus,
									}));
									publishPresentationUpdated(payload.presentation_id);
									publishPointsBalance(payload.slide_tokens_remaining);
									return false;
								}

								case "save_error":
									console.error("Save error:", (data as ErrorEventPayload).error);
									break;

								case "error": {
									const payload = data as ErrorEventPayload;
									clearStoredGeneration(streamedJobId || "");
									if (payload.presentation_id) {
										publishPresentationUpdated(payload.presentation_id);
									}
									setStreamingState((prev) => ({
										...prev,
										isStreaming: false,
										isComplete: false,
										error: payload.error,
										researchStatus: "idle",
									}));
									return false;
								}
							}
						});

						// The stream ended without a terminal saved/error event.
						if (streamedJobId) {
							releaseActiveStream(controller);
							setReconnectVersion((version) => version + 1);
							return;
						}

						const persisted = streamedPresentationId
							? await fetchPersistedPresentation(streamedPresentationId, controller.signal).catch(
									() => null,
								)
							: null;
						if (controller.signal.aborted || abortControllerRef.current !== controller) return;
						const persistedSlides = persisted?.slides ?? [];
						const generatedSlides = completedData?.slides ?? [];
						if (
							receivedComplete &&
							persisted &&
							(persisted as (PresentationData & { status?: string }) | null)?.status === "ready" &&
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
					} catch (streamErr: unknown) {
						const isAbort = streamErr instanceof Error && streamErr.name === "AbortError";
						if (!isAbort && streamedJobId) {
							releaseActiveStream(controller);
							setReconnectVersion((version) => version + 1);
						} else if (!isAbort) {
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
						releaseActiveStream(controller);
					}
				};

				// Start processing the stream in the background
				processStream();
				return true;
			} catch (err: unknown) {
				releaseActiveStream(controller);
				const isAbort = err instanceof Error && err.name === "AbortError";
				if (!isAbort) {
					setStreamingState((prev) => ({
						...prev,
						isStreaming: true,
						error: undefined,
						generationMessage: "Reconnecting to generation",
					}));
					setReconnectVersion((version) => version + 1);
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
			const requestIdempotencyKey = idempotencyKey();

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

			const controller = new AbortController();
			abortControllerRef.current = controller;
			storeGeneration({
				jobId: "",
				idempotencyKey: requestIdempotencyKey,
				presentationId: parentPresentationId,
				operation: "iteration",
				prompt,
				requestedSlides: slideCount,
				theme: "corporate-blue",
				lastEventId: 0,
			});

			try {
				const response = await fetch(`${API_URL}/iterate-presentation-stream`, {
					method: "POST",
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
						"Idempotency-Key": requestIdempotencyKey,
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
					signal: controller.signal,
				});

				// Handle 401 Unauthorized - token might be expired
				if (response.status === 401) {
					clearStoredGeneration("");
					releaseActiveStream(controller);
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: "Session expired. Please log in again.",
					}));
					return false;
				}

				if (response.status === 422) {
					clearStoredGeneration("");
					releaseActiveStream(controller);
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
					clearStoredGeneration("");
					releaseActiveStream(controller);
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: `Insufficient points. You have ${
							errorData?.slide_tokens_remaining?.toFixed(1) || 0
						} points, but need at least ${errorData?.slide_tokens_required || 1} to iterate.`,
					}));
					return false;
				}
				if (response.status >= 500) {
					releaseActiveStream(controller);
					setStreamingState((previous) => ({
						...previous,
						isStreaming: true,
						error: undefined,
						generationMessage: "Confirming generation submission",
					}));
					setReconnectVersion((version) => version + 1);
					return true;
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
					clearStoredGeneration("");
					releaseActiveStream(controller);
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: errorMessage,
					}));
					return false;
				}
				const responseJobId = response.headers.get("X-Generation-Job-ID") || undefined;
				const responsePresentationId =
					response.headers.get("X-Presentation-ID") || parentPresentationId;
				if (!responseJobId) clearStoredGeneration("");
				if (responseJobId) {
					storeGeneration({
						jobId: responseJobId,
						idempotencyKey: requestIdempotencyKey,
						presentationId: responsePresentationId,
						operation: "iteration",
						prompt,
						requestedSlides: slideCount,
						theme: "corporate-blue",
						lastEventId: 0,
					});
					setStreamingState((previous) => ({ ...previous, jobId: responseJobId }));
				}

				const reader = response.body?.getReader();
				if (!reader) {
					if (responseJobId) {
						releaseActiveStream(controller);
						setReconnectVersion((version) => version + 1);
						return true;
					}
					releaseActiveStream(controller);
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: "Failed to read streaming response",
					}));
					return false;
				}

				readerRef.current = reader;
				let streamedJobId = responseJobId;
				let receivedComplete = false;
				let completedData: PresentationData | null = null;

				const processStream = async () => {
					try {
						await consumeSSEStream(reader, ({ event, id, data }) => {
							switch (event) {
								case "created": {
									const payload = data as CreatedEventPayload;
									streamedJobId = payload.job_id;
									if (streamedJobId) {
										storeGeneration({
											jobId: streamedJobId,
											idempotencyKey: requestIdempotencyKey,
											presentationId: payload.presentation_id || parentPresentationId,
											operation: "iteration",
											prompt,
											requestedSlides: slideCount,
											theme: "corporate-blue",
											lastEventId: id,
										});
									}
									setStreamingState((prev) => ({ ...prev, jobId: payload.job_id }));
									break;
								}

								case "start":
									applyStartEvent();
									break;

							case "research":
								applyResearchEvent(data as ResearchEventPayload);
								break;

							case "stage":
								applyStageEvent(data as StageEventPayload);
								break;

							case "outline":
								applyOutlineEvent(data as PresentationOutline);
								break;

							case "plan":
								applyPlanEvent(data as DeckPlan);
								break;

							case "theme":
								applyThemeEvent(data as ThemeEventPayload);
								break;

							case "retry":
								applyRetryEvent("Updated Presentation");
								break;

							case "slide":
								applySlideEvent(data as SlideEventPayload);
								break;

							case "complete":
								receivedComplete = true;
								completedData = data as PresentationData;
								// Use complete slides data if available to ensure consistency
								applyCompleteEvent(completedData);
								break;

							case "saved": {
								const payload = data as SavedEventPayload;
								clearStoredGeneration(streamedJobId || "");
								// Iteration saved - presentation updated in place
								setStreamingState((prev) => ({
									...prev,
									isStreaming: false,
									isComplete: true,
									presentationId: payload.presentation_id || prev.presentationId,
									researchStatus:
										prev.researchStatus === "generating" ? "ready" : prev.researchStatus,
								}));
								publishPresentationUpdated(payload.presentation_id || parentPresentationId);
								publishPointsBalance(payload.slide_tokens_remaining);
								return false;
							}

							case "save_error":
								console.error("Save error during iteration:", (data as ErrorEventPayload).error);
								break;

							case "error": {
								const payload = data as ErrorEventPayload;
								clearStoredGeneration(streamedJobId || "");
								setStreamingState((prev) => ({
									...prev,
									isStreaming: false,
									isComplete: false,
									error: payload.error,
									researchStatus: "idle",
								}));
								return false;
							}
						}
					});

					// The stream ended without a terminal saved/error event.
					if (streamedJobId) {
						releaseActiveStream(controller);
						setReconnectVersion((version) => version + 1);
						return;
					}

					const persisted = await fetchPersistedPresentation(
						parentPresentationId,
						controller.signal,
					).catch(() => null);
					if (controller.signal.aborted || abortControllerRef.current !== controller) return;
					const persistedSlides = persisted?.slides ?? [];
					const generatedSlides = completedData?.slides ?? [];
					if (
						persisted &&
						(persisted as (PresentationData & { status?: string }) | null)?.status === "ready" &&
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
				} catch (streamErr: unknown) {
						const isAbort = streamErr instanceof Error && streamErr.name === "AbortError";
						if (!isAbort && streamedJobId) {
							releaseActiveStream(controller);
							setReconnectVersion((version) => version + 1);
						} else if (!isAbort) {
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
						releaseActiveStream(controller);
					}
				};

				// Start processing the stream in the background
				processStream();
				return true;
			} catch (err: unknown) {
				releaseActiveStream(controller);
				const isAbort = err instanceof Error && err.name === "AbortError";
				if (!isAbort) {
					setStreamingState((prev) => ({
						...prev,
						isStreaming: true,
						error: undefined,
						generationMessage: "Reconnecting to generation",
					}));
					setReconnectVersion((version) => version + 1);
				}
				return false;
			}
		},
		[releaseActiveStream],
	);

	useEffect(() => {
		const initialStored = readStoredGeneration();
		if (!initialStored || activeStreamRef.current) return;

		const controller = new AbortController();
		abortControllerRef.current = controller;
		activeStreamRef.current = true;
		setStreamingState({
			...initialState,
			isStreaming: true,
			jobId: initialStored.jobId || undefined,
			presentationId: initialStored.presentationId || undefined,
			operation: initialStored.operation,
			prompt: initialStored.prompt,
			requestedSlides: initialStored.requestedSlides,
			theme: initialStored.theme,
		});

		const resume = async () => {
			let stored = initialStored;
			let retryDelay = 1000;
			let lookupAttempts = 0;
			while (!stored.jobId && !controller.signal.aborted) {
				if (!stored.idempotencyKey) {
					clearStoredGeneration("");
					setStreamingState((previous) => ({
						...previous,
						isStreaming: false,
						error: "Unable to recover the submitted generation request.",
					}));
					return;
				}
				try {
					const response = await fetch(
						`${API_URL}/generation-jobs/idempotency/${encodeURIComponent(stored.idempotencyKey)}/job?kind=${stored.operation}`,
						{ credentials: "include", signal: controller.signal },
					);
					if (response.status === 401 || response.status === 403) {
						setStreamingState((previous) => ({
							...previous,
							isStreaming: false,
							error: "Session expired. Please log in again.",
						}));
						await waitForRetry(retryDelay, controller.signal);
						retryDelay = Math.min(retryDelay * 2, 10_000);
						continue;
					}
					if (response.ok) {
						const job = (await response.json()) as { id?: string; presentation_id?: string };
						if (job.id && job.presentation_id) {
							stored = {
								...stored,
								jobId: job.id,
								presentationId: job.presentation_id,
								lastEventId: 0,
							};
							storeGeneration(stored);
							setStreamingState((previous) => ({
								...previous,
								jobId: job.id,
								presentationId: job.presentation_id,
								generationMessage: undefined,
							}));
							break;
						}
					}
					if (response.status !== 404 && response.status !== 429 && response.status < 500) {
						clearStoredGeneration("");
						setStreamingState((previous) => ({
							...previous,
							isStreaming: false,
							error: "Unable to recover the submitted generation request.",
						}));
						return;
					}
				} catch (error) {
					if (controller.signal.aborted) return;
					console.error("Generation lookup failed:", error);
				}
				lookupAttempts++;
				if (lookupAttempts >= 4) {
					setStreamingState((previous) => ({
						...previous,
						isStreaming: false,
						error: "Unable to confirm the submitted generation yet. Reload to try again.",
					}));
					return;
				}
				await waitForRetry(retryDelay, controller.signal);
				retryDelay = Math.min(retryDelay * 2, 10_000);
			}
			let cursor = 0;
			let receivedComplete = false;
			while (!controller.signal.aborted) {
				try {
					const response = await fetch(
						`${API_URL}/generation-jobs/${stored.jobId}/events?after=${cursor}`,
						{ credentials: "include", signal: controller.signal },
					);
					if (response.status === 401 || response.status === 403) {
						setStreamingState((previous) => ({
							...previous,
							isStreaming: false,
							isComplete: false,
							error: "Session expired. Please log in again.",
						}));
						await waitForRetry(retryDelay, controller.signal);
						retryDelay = Math.min(retryDelay * 2, 10_000);
						continue;
					}
					if (response.status === 404 || response.status === 410) {
						clearStoredGeneration(stored.jobId);
						setStreamingState((previous) => ({
							...previous,
							isStreaming: false,
							isComplete: false,
							error: "The saved generation job is no longer available.",
						}));
						return;
					}
					if (response.status !== 429 && response.status >= 400 && response.status < 500) {
						clearStoredGeneration(stored.jobId);
						setStreamingState((previous) => ({
							...previous,
							isStreaming: false,
							error: `Unable to reconnect to generation (${response.status}).`,
						}));
						return;
					}
					if (!response.ok || !response.body) {
						throw new Error(`Unable to reconnect to generation (${response.status}).`);
					}
					const reader = response.body.getReader();
					readerRef.current = reader;
					const decoder = new TextDecoder();
					let buffer = "";
					let currentEvent = "";
					let currentEventId = cursor;
					let terminal = false;
					while (!terminal) {
						const { done, value } = await reader.read();
						if (done) break;
						buffer += decoder.decode(value, { stream: true });
						const lines = buffer.split("\n");
						buffer = lines.pop() || "";
						for (const line of lines) {
							if (line.startsWith("id: ")) {
								currentEventId = Number(line.slice(4).trim()) || currentEventId;
								continue;
							}
							if (line.startsWith("event: ")) {
								currentEvent = line.slice(7).trim();
								continue;
							}
							if (!line.startsWith("data: ") || !currentEvent) continue;
							const data = JSON.parse(line.slice(6));
							const previousCursor = cursor;
							cursor = currentEventId;
							if (currentEvent !== "saved" && currentEvent !== "error") {
								storeGeneration({ ...stored, lastEventId: cursor });
								if (cursor > previousCursor) retryDelay = 1000;
							}
							switch (currentEvent) {
								case "research":
									setStreamingState((previous) => ({
										...previous,
										researchStatus: data.status || previous.researchStatus,
										researchSources: data.sources ?? previous.researchSources,
									}));
									break;
								case "theme":
									setStreamingState((previous) => ({ ...previous, theme: data.theme }));
									break;
								case "stage":
									setStreamingState((previous) => ({
										...previous,
										generationStage: data.stage,
										generationMessage: data.message,
										generationProgress: { completed: data.completed, total: data.total },
									}));
									break;
								case "outline":
									setStreamingState((previous) => ({
										...previous,
										outline: data,
										title: data.title || previous.title,
									}));
									break;
								case "plan":
									setStreamingState((previous) => ({
										...previous,
										deckPlan: data,
										title: data.title || previous.title,
									}));
									break;
								case "retry":
									setStreamingState((previous) => ({
										...previous,
										slides: [],
										isComplete: false,
										error: undefined,
									}));
									break;
								case "slide":
									setStreamingState((previous) => {
										const slides = [...previous.slides];
										slides[Number(data.index)] = data.slide;
										return {
											...previous,
											slides,
											title: data.title || previous.title,
											totalSlides: slides.length,
										};
									});
									break;
								case "complete":
									receivedComplete = true;
									setStreamingState((previous) => ({
										...previous,
										completedDocument: data,
										theme: data.theme || previous.theme,
										title: data.title || previous.title,
										slides: data.slides || previous.slides,
										totalSlides: data.slides?.length || previous.slides.length,
									}));
									break;
								case "saved": {
									const persisted = receivedComplete
										? null
										: await fetchPersistedPresentation(
												data.presentation_id || stored.presentationId,
												controller.signal,
											).catch(() => null);
									if (controller.signal.aborted || abortControllerRef.current !== controller)
										return;
									if (!receivedComplete && !persisted) {
										cursor = Math.max(0, currentEventId - 1);
										storeGeneration({ ...stored, lastEventId: cursor });
										break;
									}
									terminal = true;
									clearStoredGeneration(stored.jobId);
									setStreamingState((previous) => ({
										...previous,
										...persisted,
										isStreaming: false,
										isComplete: true,
										completedDocument: persisted || previous.completedDocument,
										slides: persisted?.slides || previous.slides,
										totalSlides: persisted?.slides?.length || previous.slides.length,
										presentationId: data.presentation_id || previous.presentationId,
									}));
									publishPresentationUpdated(data.presentation_id || stored.presentationId);
									publishPointsBalance(data.slide_tokens_remaining);
									break;
								}
								case "error":
									terminal = true;
									clearStoredGeneration(stored.jobId);
									setStreamingState((previous) => ({
										...previous,
										isStreaming: false,
										isComplete: false,
										error: data.error,
									}));
									break;
							}
							currentEvent = "";
							if (terminal) break;
						}
					}
					if (terminal) return;
				} catch (error) {
					if (controller.signal.aborted) return;
					console.error("Generation reconnect failed:", error);
				}
				await waitForRetry(retryDelay, controller.signal);
				retryDelay = Math.min(retryDelay * 2, 10_000);
			}
		};

		void resume().finally(() => releaseActiveStream(controller));
		return () => {
			controller.abort();
			releaseActiveStream(controller);
		};
	}, [reconnectVersion, releaseActiveStream]);

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
