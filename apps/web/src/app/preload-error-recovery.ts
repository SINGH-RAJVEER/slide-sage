const RECOVERED_PRELOAD_ERRORS_KEY = "slidesage-recovered-preload-errors";
const MAX_RECOVERED_PRELOAD_ERRORS = 10;

type RecoveryStorage = Pick<Storage, "getItem" | "setItem">;

type PreloadErrorRecoveryOptions = {
	storage?: RecoveryStorage;
	reload?: () => void;
};

function getSessionStorage(): RecoveryStorage | undefined {
	try {
		return window.sessionStorage;
	} catch {
		return undefined;
	}
}

function claimRecovery(storage: RecoveryStorage | undefined, fingerprint: string): boolean {
	if (!storage) return false;

	try {
		const storedValue = storage.getItem(RECOVERED_PRELOAD_ERRORS_KEY);
		const parsedValue: unknown = storedValue ? JSON.parse(storedValue) : [];
		const recoveredErrors = Array.isArray(parsedValue)
			? parsedValue.filter((value): value is string => typeof value === "string")
			: [];

		if (recoveredErrors.includes(fingerprint)) return false;

		storage.setItem(
			RECOVERED_PRELOAD_ERRORS_KEY,
			JSON.stringify([...recoveredErrors.slice(-(MAX_RECOVERED_PRELOAD_ERRORS - 1)), fingerprint]),
		);
		return true;
	} catch {
		return false;
	}
}

export function installPreloadErrorRecovery({
	storage = getSessionStorage(),
	reload = () => window.location.reload(),
}: PreloadErrorRecoveryOptions = {}) {
	const handlePreloadError = (event: VitePreloadErrorEvent) => {
		const fingerprint = event.payload.message.trim();
		if (!fingerprint || !claimRecovery(storage, fingerprint)) return;

		event.preventDefault();
		reload();
	};

	window.addEventListener("vite:preloadError", handlePreloadError);

	return () => window.removeEventListener("vite:preloadError", handlePreloadError);
}
