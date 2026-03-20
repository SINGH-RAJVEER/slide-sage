import "bun:test";

declare module "bun:test" {
    interface Matchers<T> {
        toBeInTheDocument(): T;
        toHaveTextContent(text: string | RegExp): T;
        toHaveClass(...classNames: string[]): T;
        toBeDisabled(): T;
    }
}
