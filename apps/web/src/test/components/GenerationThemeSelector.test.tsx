/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";

mock.module("@slide-sage/ui/components/dropdown-menu", () => ({
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
        const onThemeChange = mock(() => {});
        const { GenerationThemeSelector } = await import(
            "@slide-sage/ui/components/Generate/GenerationThemeSelector"
        );
        const { getByRole } = render(
            <GenerationThemeSelector
                theme="corporate-blue"
                onThemeChange={onThemeChange}
                installedThemes={[
                    {
                        marketplaceId: "midnight-signal",
                        themeId: "modern-dark",
                        name: "Midnight Signal",
                    },
                ]}
            />,
        );

        fireEvent.click(getByRole("button", { name: /Midnight Signal Marketplace/i }));

        expect(onThemeChange).toHaveBeenCalledWith("modern-dark");
    });
});
