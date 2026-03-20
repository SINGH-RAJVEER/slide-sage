/// <reference lib="dom" />

import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

describe("Card Component", () => {
    it("renders card with content", () => {
        const { getByText } = render(
            <Card>
                <CardContent>Test content</CardContent>
            </Card>,
        );

        expect(getByText("Test content")).toBeInTheDocument();
    });

    it("renders card with header and title", () => {
        const { getByText } = render(
            <Card>
                <CardHeader>
                    <CardTitle>Test Title</CardTitle>
                </CardHeader>
                <CardContent>Content</CardContent>
            </Card>,
        );

        expect(getByText("Test Title")).toBeInTheDocument();
        expect(getByText("Content")).toBeInTheDocument();
    });

    it("renders multiple cards", () => {
        const { getAllByText } = render(
            <>
                <Card>
                    <CardContent>Card 1</CardContent>
                </Card>
                <Card>
                    <CardContent>Card 2</CardContent>
                </Card>
            </>,
        );

        const cards = getAllByText(/Card \d/);
        expect(cards).toHaveLength(2);
    });
});
