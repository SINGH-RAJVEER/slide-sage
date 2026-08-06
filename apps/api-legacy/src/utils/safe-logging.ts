const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/;

export function safeErrorProjection(error: unknown): { name: string } {
	const name = error instanceof Error && SAFE_ERROR_NAME.test(error.name) ? error.name : "Error";
	return { name };
}

export function logSafeError(event: string, error: unknown): void {
	console.error(JSON.stringify({ event, error: safeErrorProjection(error) }));
}
