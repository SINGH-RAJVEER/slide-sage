import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

GlobalRegistrator.register();

if (typeof document === "undefined") {
    throw new Error("document is not defined after GlobalRegistrator.register()");
}

afterEach(() => {
    cleanup();
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
