import { afterEach, expect } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const { default: _defaultMatchers, ...matchers } = await import(
    "@testing-library/jest-dom/matchers"
);
expect.extend(matchers);
const { cleanup } = await import("@testing-library/react");

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    }),
});

Object.defineProperties(HTMLElement.prototype, {
    scrollIntoView: { configurable: true, value: () => {} },
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => {} },
    releasePointerCapture: { configurable: true, value: () => {} },
});

if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}
