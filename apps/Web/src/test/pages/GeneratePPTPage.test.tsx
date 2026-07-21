/// <reference lib="dom" />

import { expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StreamingProvider } from "@/modules/contexts/StreamingContext";
import GeneratePPTPage from "@/modules/pages/GeneratePPTPage";

it("prefills a failed presentation prompt and generation options", () => {
    const view = render(
        <MemoryRouter
            initialEntries={[
                {
                    pathname: "/generate",
                    state: {
                        retry: {
                            prompt: "Retry this market analysis",
                            slide_count: 12,
                            detail_level: "comprehensive",
                            tonality: "casual",
                            research_enabled: true,
                            theme: "nature-green",
                            layout_preference: "image-led",
                        },
                    },
                },
            ]}
        >
            <StreamingProvider>
                <Routes>
                    <Route path="/generate" element={<GeneratePPTPage />} />
                </Routes>
            </StreamingProvider>
        </MemoryRouter>,
    );

    expect(view.getByRole("textbox", { name: "Topic 1" })).toHaveValue(
        "Retry this market analysis",
    );
    expect(view.getByDisplayValue("12")).toBeInTheDocument();
    expect(view.getByText("Comprehensive")).toBeInTheDocument();
    expect(view.getByText("Casual")).toBeInTheDocument();
    expect(view.getByText("Nature Green")).toBeInTheDocument();
    expect(view.getByText("Image-led")).toBeInTheDocument();
    expect(view.getByRole("button", { name: /Web Research/ })).toHaveClass("bg-white/10");
    expect(view.getByRole("button", { name: "Start Generating" })).not.toBeDisabled();
});
