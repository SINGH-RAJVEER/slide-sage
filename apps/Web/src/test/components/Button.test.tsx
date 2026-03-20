/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { render } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button Component", () => {
    it("renders button with text", () => {
        const { getByRole } = render(<Button>Click me</Button>);

        const button = getByRole("button");
        expect(button).toBeInTheDocument();
        expect(button).toHaveTextContent("Click me");
    });

    it("renders button with default variant", () => {
        const { getByRole } = render(<Button>Default</Button>);

        const button = getByRole("button");
        expect(button).toHaveClass("bg-primary");
    });

    it("renders button with secondary variant", () => {
        const { getByRole } = render(<Button variant="secondary">Secondary</Button>);

        const button = getByRole("button");
        expect(button).toHaveClass("bg-secondary");
    });

    it("renders disabled button", () => {
        const { getByRole } = render(<Button disabled>Disabled</Button>);

        const button = getByRole("button");
        expect(button).toBeDisabled();
    });

    it("handles click events", () => {
        const handleClick = mock(() => {});
        const { getByRole } = render(<Button onClick={handleClick}>Click</Button>);

        const button = getByRole("button");
        button.click();

        expect(handleClick).toHaveBeenCalledTimes(1);
    });
});
