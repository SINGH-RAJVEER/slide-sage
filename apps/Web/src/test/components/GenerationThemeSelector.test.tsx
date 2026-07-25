/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";

mock.module("@/components/ui/dropdown-menu", () => ({
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuItem: ({
        children,
        onClick,
    }: {
        children: React.ReactNode;
        onClick?: () => void;
    }) => (
        <button type="button" onClick={onClick}>
            {children}
        </button>
    ),
}));

describe("GenerationThemeSelector", () => {
    it("shows installed marketplace themes and selects their base theme", async () => {
        localStorage.setItem(
            "slidesage-installed-marketplace-themes",
            JSON.stringify(["midnight-signal"]),
        );
        const onThemeChange = mock(() => {});
        const { GenerationThemeSelector } = await import(
            "@/components/Generate/GenerationThemeSelector"
        );
        const { getByRole } = render(
            <GenerationThemeSelector theme="corporate-blue" onThemeChange={onThemeChange} />,
        );

        fireEvent.click(getByRole("button", { name: /Midnight Signal Marketplace/i }));

        expect(onThemeChange).toHaveBeenCalledWith("modern-dark");
    });
});
