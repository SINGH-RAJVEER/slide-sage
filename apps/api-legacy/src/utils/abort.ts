export function abortReason(signal: AbortSignal): unknown {
	return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

export function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw abortReason(signal);
}

export function combineAbortSignal(
	callerSignal: AbortSignal | undefined,
	timeoutMs: number,
	timeoutMessage: string
): {
	signal: AbortSignal;
	timedOut: () => boolean;
	clearTimeout: () => void;
	dispose: () => void;
} {
	const controller = new AbortController();
	let timeoutReached = false;
	let timeout: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
		timeoutReached = true;
		controller.abort(new DOMException(timeoutMessage, "TimeoutError"));
	}, timeoutMs);
	const onCallerAbort = () => controller.abort(abortReason(callerSignal as AbortSignal));

	if (callerSignal?.aborted) {
		onCallerAbort();
	} else {
		callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
	}

	const clear = () => {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
	};
	return {
		signal: controller.signal,
		timedOut: () => timeoutReached,
		clearTimeout: clear,
		dispose: () => {
			clear();
			callerSignal?.removeEventListener("abort", onCallerAbort);
		},
	};
}
