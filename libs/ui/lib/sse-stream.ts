export interface SSEEvent {
	/** The SSE `event:` field for the current message. */
	event: string;
	/** The last seen SSE `id:` field, parsed as a number (0 when absent). */
	id: number;
	/** The JSON-decoded `data:` payload. */
	data: unknown;
}

/**
 * Reads a server-sent-events body to completion, invoking `onEvent` once per
 * decoded message. Return `false` from `onEvent` to stop consuming early
 * (for example after a terminal `saved` or `error` event).
 *
 * Malformed JSON payloads are logged and skipped; the event name is preserved
 * so a retried `data:` line still dispatches, matching the wire format where
 * an event may span multiple data lines.
 */
export async function consumeSSEStream(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	onEvent: (message: SSEEvent) => unknown,
): Promise<void> {
	const decoder = new TextDecoder();
	let buffer = "";
	let currentEvent = "";
	let currentId = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) return;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() || "";

		for (const line of lines) {
			if (line.startsWith("id: ")) {
				currentId = Number(line.slice(4).trim()) || currentId;
				continue;
			}
			if (line.startsWith("event: ")) {
				currentEvent = line.slice(7).trim();
				continue;
			}
			if (!line.startsWith("data: ") || !currentEvent) continue;

			let data: unknown;
			try {
				data = JSON.parse(line.slice(6));
			} catch (parseError) {
				console.error("Failed to parse SSE data:", parseError);
				continue;
			}

			const proceed = await onEvent({ event: currentEvent, id: currentId, data });
			currentEvent = "";
			if (proceed === false) return;
		}
	}
}
