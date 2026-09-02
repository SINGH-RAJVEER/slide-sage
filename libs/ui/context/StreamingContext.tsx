import type {
	AIModelSelection,
	BinaryTemplateSelection,
	DeckPlan,
	PresentationData,
	PresentationGenerationStage,
	PresentationTemplateReference,
	ResearchPayload,
	Slide,
	Source,
} from "@slidesage/types";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { API_URL, readJsonResponse } from "../lib/api";
import { publishPointsBalance } from "../lib/points";
import { publishPresentationUpdated } from "../lib/presentation-events";
import { consumeSSEStream } from "../lib/sse-stream";

const ACTIVE_GENERATION_KEY = "slidesage-active-generation";
const DEFAULT_TEMPLATE_REFERENCE: PresentationTemplateReference = {
	id: "simple-business-proposal",
	version: 1,
};

interface StoredGeneration {
	jobId: string;
	presentationId: string;
	operation: "generation" | "iteration";
	prompt?: string;
	requestedSlides: number;
	theme: string;
	template: PresentationTemplateReference;
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
		const template = value.template;
		if (
			template !== undefined &&
			(!template || typeof template.id !== "string" || typeof template.version !== "number")
		) {
			window.localStorage.removeItem(ACTIVE_GENERATION_KEY);
			return null;
		}
		inMemoryGeneration = {
			...(value as StoredGeneration),
			template: template || DEFAULT_TEMPLATE_REFERENCE,
		};
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

function updateStoredCursor(jobId: string, lastEventId: number) {
	const stored = readStoredGeneration();
	if (stored && stored.jobId === jobId && stored.lastEventId < lastEventId) {
		storeGeneration({ ...stored, lastEventId });
	}
}

export interface StreamingState {
	isStreaming: boolean;
	slides: Slide[];
	theme: string;
	template?: PresentationTemplateReference;
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
	deckPlan?: DeckPlan;
	completedDocument?: PresentationData;
}

export interface GenerateOptions {
	prompt: string;
	slideCount: number;
	detailLevel: string;
	tonality: string;
	researchEnabled?: boolean;
	researchPayload?: ResearchPayload;
	parentPresentationId?: string;
	retryPresentationId?: string;
	ai?: AIModelSelection;
	template: BinaryTemplateSelection;
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
	generate: (options: GenerateOptions) => Promise<boolean>;
	cancelGeneration: () => Promise<boolean>;
	previewResearch: (
		request: ResearchPreviewRequest,
		savedResearch?: ResearchPayload,
		forceRefresh?: boolean,
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

export const StreamingContext = createContext<StreamingContextValue | null>(null);

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

interface SavedEventPayload {
	presentation_id?: string;
	slide_tokens_remaining?: number;
}

interface ErrorEventPayload {
	error?: string;
}

interface ThemeEventPayload {
	theme: string;
}

export function StreamingProvider({ children }: { children: ReactNode }) {
	const [streamingState, setStreamingState] = useState<StreamingState>(initialState);
	const [researchPreviewState, setResearchPreviewState] = useState<ResearchPreviewState>(
		initialResearchPreviewState,
	);
	const abortControllerRef = useRef<AbortController | null>(null);
	const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
	const activeStreamRef = useRef(false);
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

	const cancelGeneration = useCallback(async (): Promise<boolean> => {
		const jobId = streamingState.jobId;
		if (
			!jobId ||
			!streamingState.isStreaming ||
			streamingState.operation !== "generation" ||
			streamingState.slides.length > 0
		) {
			return false;
		}

		try {
			const response = await fetch(`${API_URL}/generation-jobs/${jobId}/cancel`, {
				method: "POST",
				credentials: "include",
			});
			if (!response.ok) return false;

			clearStoredGeneration(jobId);
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
				abortControllerRef.current = null;
			}
			if (readerRef.current) {
				void readerRef.current.cancel();
				readerRef.current = null;
			}
			releaseActiveStream();
			setStreamingState(initialState);
			return true;
		} catch {
			return false;
		}
	}, [
		releaseActiveStream,
		streamingState.isStreaming,
		streamingState.jobId,
		streamingState.operation,
		streamingState.slides.length,
	]);

	// Shared SSE event dispatch used by every consumption path so live and
	// resumed streams update state identically. Returns true when the event
	// was a complete document snapshot.
	const applyStreamEvent = useCallback((event: string, data: unknown): boolean => {
		switch (event) {
			case "start":
				setStreamingState((prev) => ({
					...prev,
					researchStatus:
						prev.researchStatus && prev.researchStatus !== "idle"
							? "generating"
							: prev.researchStatus,
				}));
				break;

			case "research": {
				const payload = data as ResearchEventPayload;
				setStreamingState((prev) => ({
					...prev,
					researchStatus: payload.status || prev.researchStatus,
					researchSources: payload.sources ?? prev.researchSources,
				}));
				break;
			}

			case "stage": {
				const payload = data as StageEventPayload;
				setStreamingState((prev) => ({
					...prev,
					generationStage: payload.stage,
					generationMessage: payload.message,
					generationProgress: { completed: payload.completed ?? 0, total: payload.total ?? 0 },
				}));
				break;
			}

			case "plan":
				setStreamingState((prev) => ({
					...prev,
					deckPlan: data as DeckPlan,
					title: (data as DeckPlan).title || prev.title,
				}));
				break;

			case "theme": {
				const payload = data as ThemeEventPayload;
				const stored = readStoredGeneration();
				if (stored) storeGeneration({ ...stored, theme: payload.theme });
				setStreamingState((prev) => ({ ...prev, theme: payload.theme }));
				break;
			}

			case "retry":
				setStreamingState((prev) => ({
					...prev,
					slides: [],
					isComplete: false,
					error: undefined,
				}));
				break;

			case "slide": {
				const payload = data as SlideEventPayload;
				setStreamingState((prev) => {
					const slides = [...prev.slides];
					const index = Number(payload.index);
					if (Number.isInteger(index) && index >= 0) {
						slides[index] = payload.slide;
					} else {
						const existingIndex = slides.findIndex((slide) => slide.id === payload.slide.id);
						if (existingIndex >= 0) {
							slides[existingIndex] = payload.slide;
						} else {
							slides.push(payload.slide);
						}
					}
					return {
						...prev,
						slides,
						title: payload.title || prev.title,
						totalSlides: slides.length,
					};
				});
				break;
			}

			case "complete": {
				const document = data as PresentationData;
				setStreamingState((prev) => ({
					...prev,
					completedDocument: document,
					template: document.template || prev.template,
					theme: document.theme || prev.theme,
					title: document.title || prev.title,
					slides: document.slides || prev.slides,
					totalSlides:
						document.totalSlides || (document.slides ? document.slides.length : prev.slides.length),
				}));
				return true;
			}
		}
		return false;
	}, []);

	// consumeJobEvents is the single resumable event consumer for a submitted
	// job: it tails GET /generation-jobs/{id}/events from `lastEventId`, and on
	// any interruption retries with exponential backoff until a terminal
	// saved/error event arrives or the caller aborts.
	const consumeJobEvents = useCallback(
		async (jobId: string, presentationId: string, controller: AbortController, startCursor = 0) => {
			let cursor = startCursor;
			let retryDelay = 1000;
			let receivedComplete = false;

			const fail = (message: string) => {
				clearStoredGeneration(jobId);
				setStreamingState((prev) => ({
					...prev,
					isStreaming: false,
					isComplete: false,
					error: message,
				}));
			};

			while (!controller.signal.aborted) {
				let terminal = false;
				try {
					const response = await fetch(
						`${API_URL}/generation-jobs/${jobId}/events?after=${cursor}`,
						{
							credentials: "include",
							signal: controller.signal,
						},
					);

					if (response.status === 401 || response.status === 403) {
						setStreamingState((prev) => ({
							...prev,
							error: "Session expired. Please log in again.",
						}));
					} else if (response.status === 404 || response.status === 410) {
						fail("The generation job is no longer available.");
						return;
					} else if (!response.ok || !response.body) {
						throw new Error(`Unable to read generation events (${response.status}).`);
					} else {
						const reader = response.body.getReader();
						readerRef.current = reader;
						await consumeSSEStream(reader, async ({ event, id, data }) => {
							const previousCursor = cursor;
							cursor = id;
							if (cursor > previousCursor && event !== "saved" && event !== "error") {
								updateStoredCursor(jobId, cursor);
								retryDelay = 1000;
							}
							if (applyStreamEvent(event, data)) receivedComplete = true;

							switch (event) {
								case "created": {
									const payload = data as { job_id?: string; presentation_id?: string };
									setStreamingState((prev) => ({
										...prev,
										jobId: payload.job_id || prev.jobId,
										presentationId: payload.presentation_id || prev.presentationId,
									}));
									break;
								}

								case "saved": {
									const payload = data as SavedEventPayload;
									clearStoredGeneration(jobId);
									const persisted = receivedComplete
										? null
										: await fetchPersistedPresentation(
												payload.presentation_id || presentationId,
												controller.signal,
											).catch(() => null);
									if (controller.signal.aborted || abortControllerRef.current !== controller) {
										return false;
									}
									if (!receivedComplete && !persisted) {
										// The save confirmation arrived without a replayable
										// document; rewind so the stream resends the tail.
										cursor = Math.max(0, id - 1);
										updateStoredCursor(jobId, cursor);
										return true;
									}
									terminal = true;
									setStreamingState((prev) => ({
										...prev,
										...(persisted ?? {}),
										isStreaming: false,
										isComplete: true,
										completedDocument: persisted || prev.completedDocument,
										slides: persisted?.slides || prev.slides,
										totalSlides: persisted?.slides?.length || prev.slides.length,
										presentationId: payload.presentation_id || prev.presentationId,
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
									terminal = true;
									fail(payload.error ?? "Presentation generation failed.");
									return false;
								}
							}
						});
					}
					if (terminal || controller.signal.aborted || abortControllerRef.current !== controller) {
						return;
					}
				} catch (error) {
					if (controller.signal.aborted) return;
					console.error("Generation stream failed:", error);
				}
				await waitForRetry(retryDelay, controller.signal);
				retryDelay = Math.min(retryDelay * 2, 10_000);
			}
		},
		[applyStreamEvent],
	);

	const generate = useCallback(
		async (options: GenerateOptions): Promise<boolean> => {
			if (activeStreamRef.current) return false;
			activeStreamRef.current = true;
			const jobId = crypto.randomUUID();
			const operation = options.parentPresentationId ? "iteration" : "generation";
			const targetPresentationId =
				options.parentPresentationId ?? options.retryPresentationId ?? "";
			setStreamingState({
				...initialState,
				isStreaming: true,
				jobId,
				requestedSlides: options.slideCount,
				theme: options.template.previewThemeId,
				template: { id: options.template.id, version: options.template.version },
				operation,
				prompt: options.prompt,
				presentationId: targetPresentationId || undefined,
				researchStatus: options.researchEnabled && !options.researchPayload ? "searching" : "idle",
			});
			const stored: StoredGeneration = {
				jobId,
				presentationId: targetPresentationId,
				operation,
				prompt: options.prompt,
				requestedSlides: options.slideCount,
				theme: options.template.previewThemeId,
				template: { id: options.template.id, version: options.template.version },
				lastEventId: 0,
			};
			storeGeneration(stored);

			const controller = new AbortController();
			abortControllerRef.current = controller;
			const attachAndConsume = async (attachedPresentationId?: string) => {
				storeGeneration({
					...stored,
					presentationId: attachedPresentationId || stored.presentationId,
				});
				setStreamingState((prev) => ({
					...prev,
					jobId,
					presentationId: attachedPresentationId || prev.presentationId,
				}));
				// Release the stream slot no matter how consumption ends, so later
				// generations are not blocked by a finished or failed stream.
				await consumeJobEvents(
					jobId,
					attachedPresentationId || targetPresentationId,
					controller,
				).finally(() => releaseActiveStream(controller));
			};

			try {
				const response = await fetch(`${API_URL}/presentation-jobs`, {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						job_id: jobId,
						topic: options.prompt,
						slide_count: options.slideCount,
						detail_level: options.detailLevel,
						tonality: options.tonality,
						research: { enabled: Boolean(options.researchEnabled) },
						research_payload: options.researchPayload,
						parent_presentation_id: options.parentPresentationId,
						retry_presentation_id: options.retryPresentationId,
						ai: options.ai,
						theme: options.template.previewThemeId,
						template: { id: options.template.id, version: options.template.version },
					}),
					signal: controller.signal,
				});

				if (response.status === 401 || response.status === 422) {
					clearStoredGeneration(jobId);
					releaseActiveStream(controller);
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error:
							response.status === 401
								? "Session expired. Please log in again."
								: "Your session is invalid. Please log out and log in again.",
					}));
					return false;
				}

				if (response.status === 402) {
					const errorData = await readJsonResponse<{
						slide_tokens_remaining?: number;
						slide_tokens_required?: number;
					}>(response);
					publishPointsBalance(errorData?.slide_tokens_remaining);
					clearStoredGeneration(jobId);
					releaseActiveStream(controller);
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: `Insufficient points. You have ${
							errorData?.slide_tokens_remaining?.toFixed(1) || 0
						} points, but need at least ${errorData?.slide_tokens_required || 1}.`,
					}));
					return false;
				}

				const data = await readJsonResponse<{ job_id?: string; presentation_id?: string }>(
					response,
				);
				if (!response.ok || !data?.job_id) {
					const message = (data as { error?: { message?: string } } | null)?.error?.message ?? "";
					clearStoredGeneration(jobId);
					releaseActiveStream(controller);
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: message || `Unable to start generation (${response.status}).`,
					}));
					return false;
				}

				await attachAndConsume(data.presentation_id);
				return true;
			} catch (error) {
				const isAbort =
					(error instanceof Error && error.name === "AbortError") || controller.signal.aborted;
				if (isAbort) {
					releaseActiveStream(controller);
					return false;
				}
				// The connection failed before the server responded, so submission is
				// ambiguous. The job ID was chosen up front: recover by asking for it.
				try {
					const recovery = await fetch(`${API_URL}/generation-jobs/${jobId}`, {
						credentials: "include",
					});
					if (recovery.ok) {
						const job = (await recovery.json().catch(() => null)) as {
							presentation_id?: string;
						} | null;
						await attachAndConsume(job?.presentation_id);
						return true;
					}
					clearStoredGeneration(jobId);
					releaseActiveStream(controller);
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: "Unable to submit the generation request. Check your connection and try again.",
					}));
					return false;
				} catch {
					clearStoredGeneration(jobId);
					releaseActiveStream(controller);
					setStreamingState((prev) => ({
						...prev,
						isStreaming: false,
						error: "Unable to submit the generation request. Check your connection and try again.",
					}));
					return false;
				}
			}
		},
		[consumeJobEvents, releaseActiveStream],
	);

	const previewResearch = useCallback(
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
			const controller = new AbortController();

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

			updateResearchPreviewState({
				...request,
				status: "loading",
				sources: [],
				estimatedTokens: null,
				error: undefined,
				requestKey,
			});

			try {
				const response = await fetch(`${API_URL}/presentation-jobs`, {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						job_id: crypto.randomUUID(),
						preview: true,
						topic: request.prompt,
						slide_count: request.slideCount,
						detail_level: request.detailLevel,
						tonality: request.tonality,
						research: { enabled: true },
					}),
					signal: controller.signal,
				});

				if (requestId !== researchRequestIdRef.current) return false;

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

				const data = await readJsonResponse<{
					sources?: Source[];
					estimated_tokens?: number;
					slide_tokens_remaining?: number;
				}>(response);
				if (requestId !== researchRequestIdRef.current) return false;
				publishPointsBalance(data?.slide_tokens_remaining);

				updateResearchPreviewState({
					...request,
					status: "ready",
					sources: Array.isArray(data?.sources) ? data.sources : [],
					estimatedTokens:
						typeof data?.estimated_tokens === "number" ? data.estimated_tokens : null,
					requestKey,
				});
				return true;
			} catch (err: unknown) {
				const isAbort = err instanceof Error && err.name === "AbortError";
				if (isAbort || requestId !== researchRequestIdRef.current) return false;
				const message = err instanceof Error ? err.message : String(err);
				updateResearchPreviewState((previous) => ({
					...previous,
					status: "error",
					error: message,
				}));
				return false;
			}
		},
		[updateResearchPreviewState],
	);

	const getPresentation = useCallback((): PresentationData | null => {
		if (streamingState.slides.length === 0) return null;
		return {
			...streamingState.completedDocument,
			deckPlan: streamingState.deckPlan ?? streamingState.completedDocument?.deckPlan,
			template: streamingState.template ?? streamingState.completedDocument?.template,
			title: streamingState.title,
			theme: streamingState.theme,
			slides: streamingState.slides,
			totalSlides: streamingState.slides.length,
		};
	}, [streamingState]);

	// Resume any persisted active generation after a reload or navigation.
	useEffect(() => {
		const initialStored = readStoredGeneration();
		if (!initialStored?.jobId || activeStreamRef.current) return;

		const controller = new AbortController();
		abortControllerRef.current = controller;
		activeStreamRef.current = true;
		setStreamingState({
			...initialState,
			isStreaming: true,
			jobId: initialStored.jobId,
			presentationId: initialStored.presentationId || undefined,
			operation: initialStored.operation,
			prompt: initialStored.prompt,
			requestedSlides: initialStored.requestedSlides,
			theme: initialStored.theme,
			template: initialStored.template,
		});

		void consumeJobEvents(
			initialStored.jobId,
			initialStored.presentationId,
			controller,
			initialStored.lastEventId,
		).finally(() => releaseActiveStream(controller));
		return () => {
			controller.abort();
			releaseActiveStream(controller);
		};
	}, [consumeJobEvents, releaseActiveStream]);

	useEffect(() => {
		return () => {
			stopStreaming();
		};
	}, [stopStreaming]);

	return (
		<StreamingContext.Provider
			value={{
				streamingState,
				researchPreviewState,
				generate,
				cancelGeneration,
				previewResearch,
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
