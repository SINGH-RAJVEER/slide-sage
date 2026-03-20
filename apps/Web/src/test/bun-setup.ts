// Bun test setup file with happy-dom

import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

// Register happy-dom globals BEFORE any imports
GlobalRegistrator.register();

// Verify document is available
if (typeof document === "undefined") {
    throw new Error("document is not defined after GlobalRegistrator.register()");
}

// Cleanup after each test
afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

// Mock window.matchMedia
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
