import type { Context } from "hono";
import { stream } from "hono/streaming";
import type { StreamingApi } from "hono/utils/stream";

const completionHeader = "x-slidesage-response-completion";
const responseCompletions = new Map<string, Promise<void>>();

export function trackedStream(
	context: Context,
	callback: (stream: StreamingApi) => Promise<void>
): Response {
	let resolveCompletion: () => void = () => undefined;
	const completion = new Promise<void>((resolve) => {
		resolveCompletion = resolve;
	});
	const completionId = crypto.randomUUID();
	const response = stream(
		context,
		async (streamApi) => {
			try {
				await callback(streamApi);
			} finally {
				resolveCompletion();
			}
		},
		async (error) => {
			resolveCompletion();
			console.error(
				JSON.stringify({ event: "stream_callback_failed", error: { name: error.name } })
			);
		}
	);
	response.headers.set(completionHeader, completionId);
	responseCompletions.set(completionId, completion);
	return response;
}

export function takeResponseCompletion(response: Response): Promise<void> | undefined {
	const completionId = response.headers.get(completionHeader);
	if (!completionId) return undefined;
	response.headers.delete(completionHeader);
	const completion = responseCompletions.get(completionId);
	responseCompletions.delete(completionId);
	return completion;
}
