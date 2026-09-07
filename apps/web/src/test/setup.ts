import { afterAll, afterEach, expect, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// Bun keeps mock.module registrations for the life of the process, and
// --isolate does not undo them, so a file that mocks a shared module changes
// what every later file imports. The real modules are captured before any test
// runs and put back when a file finishes, which makes the suite independent of
// the order its files happen to run in.
const restorableModules = [
	"@slidesage/ui/context/AuthContext",
	"@slidesage/ui/lib/auth-client",
] as const;

const realModules = await Promise.all(
	restorableModules.map(async (specifier) => [specifier, { ...(await import(specifier)) }] as const),
);

afterAll(() => {
	for (const [specifier, exports] of realModules) {
		mock.module(specifier, () => exports);
	}
});

const { default: _defaultMatchers, ...matchers } = await import(
	"@testing-library/jest-dom/matchers"
);
expect.extend(matchers);
const { cleanup } = await import("@testing-library/react");

if (typeof document === "undefined") {
	throw new Error("document is not defined after GlobalRegistrator.register()");
}

afterEach(() => {
	cleanup();
	// Clear everything rather than the two known keys: a test that leaves any
	// stored state behind changes what the next one sees, and the streaming
	// context resumes an active generation from storage on mount.
	window.localStorage.clear();
	window.sessionStorage.clear();
	document.body.innerHTML = "";
});

Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: (query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => {},
	}),
});

Object.defineProperties(HTMLElement.prototype, {
	scrollIntoView: { configurable: true, value: () => {} },
	hasPointerCapture: { configurable: true, value: () => false },
	setPointerCapture: { configurable: true, value: () => {} },
	releasePointerCapture: { configurable: true, value: () => {} },
});
