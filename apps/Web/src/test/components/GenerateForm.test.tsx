/// <reference lib="dom" />

import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { GenerateForm } from "../../components/Generate/GenerateForm";

function renderGenerateForm(overrides: Partial<React.ComponentProps<typeof GenerateForm>> = {}) {
    const props: React.ComponentProps<typeof GenerateForm> = {
        prompt: "",
        topics: [],
        loading: false,
        error: "",
        estimatedTokens: 0,
        onPromptChange: mock(),
        onKeyDown: mock(),
        onRemoveTopic: mock(),
        onEditTopic: mock(),
        onAddTopic: mock(),
        onGenerate: mock(),
        ...overrides,
    };

    return {
        props,
        ...render(<GenerateForm {...props} />),
    };
}

describe("GenerateForm", () => {
    it("renders suggested topics and adds one when selected", () => {
        const onAddTopic = mock();
        const { getByText } = renderGenerateForm({ onAddTopic });

        fireEvent.click(getByText("Product Launch Strategy"));

        expect(onAddTopic).toHaveBeenCalledWith("Product Launch Strategy");
    });

    it("disables generation until at least one topic exists", () => {
        const onGenerate = mock();
        const { getByText, rerender } = renderGenerateForm({ onGenerate });

        const disabledButton = getByText("Start Generating").closest("button");
        expect(disabledButton).toBeDisabled();

        rerender(
            <GenerateForm
                prompt=""
                topics={["Investor Pitch Deck"]}
                loading={false}
                error=""
                estimatedTokens={4.5}
                onPromptChange={mock()}
                onKeyDown={mock()}
                onRemoveTopic={mock()}
                onEditTopic={mock()}
                onAddTopic={mock()}
                onGenerate={onGenerate}
            />,
        );

        const enabledButton = getByText("Start Generating").closest("button");
        expect(enabledButton).not.toBeDisabled();

        if (!enabledButton) {
            throw new Error("Generate button was not rendered");
        }

        fireEvent.click(enabledButton);
        expect(onGenerate).toHaveBeenCalled();
    });

    it("shows estimates, removable topics, and errors", () => {
        const onRemoveTopic = mock();
        const { getAllByRole, getByDisplayValue, getByText } = renderGenerateForm({
            topics: ["Quarterly OKR Planning"],
            loading: false,
            error: "Unable to generate right now",
            estimatedTokens: 7.25,
            onRemoveTopic,
        });

        expect(getByText("Estimated 7.3 points")).toBeInTheDocument();
        expect(getByText("Unable to generate right now")).toBeInTheDocument();
        expect(getByDisplayValue("Quarterly OKR Planning")).toBeInTheDocument();

        const removeButton = getAllByRole("button")[0];
        if (!removeButton) {
            throw new Error("Remove topic button was not rendered");
        }

        fireEvent.click(removeButton);

        expect(onRemoveTopic).toHaveBeenCalledWith("Quarterly OKR Planning");
    });

    it("shows a loading state while generation is in progress", () => {
        const { getByText } = renderGenerateForm({
            topics: ["Quarterly OKR Planning"],
            loading: true,
        });

        expect(getByText("Creating...")).toBeInTheDocument();
        expect(getByText("Creating...").closest("button")).toBeDisabled();
    });
});
