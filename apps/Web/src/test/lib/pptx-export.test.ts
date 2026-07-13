import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import { buildEditablePptx } from "@/lib/pptx-export";
import type { PresentationData } from "@/modules/types/presentation";

const presentation: PresentationData = {
    title: "Editable Quarterly Review",
    theme: "corporate-blue",
    totalSlides: 2,
    slides: [
        {
            id: "content-slide",
            type: "content",
            html: `
                <div id="slide-content" class="layout-content">
                    <h2 id="slide-title">Editable Quarterly Review</h2>
                    <ul id="slide-list">
                        <li>Revenue increased by 24 percent</li>
                        <li>Customer retention reached 91 percent</li>
                    </ul>
                    <table id="slide-table">
                        <thead><tr><th>Quarter</th><th>Revenue</th></tr></thead>
                        <tbody><tr><td>Q2</td><td>$1.4M</td></tr></tbody>
                    </table>
                </div>
            `,
        },
        {
            id: "chart-slide",
            type: "chart",
            chartConfig: {
                type: "bar",
                title: "Revenue by quarter",
                description: "Quarterly revenue in millions",
                data: {
                    labels: ["Q1", "Q2"],
                    datasets: [
                        {
                            label: "Revenue",
                            data: [1.1, 1.4],
                            backgroundColor: "#2563EB",
                        },
                    ],
                },
            },
        },
    ],
};

describe("editable PPTX export", () => {
    test("writes native text, table, and chart objects into the OOXML archive", async () => {
        const pptx = await buildEditablePptx(presentation);
        const output = await pptx.write({ outputType: "arraybuffer", compression: true });
        const archive = await JSZip.loadAsync(output as ArrayBuffer);

        const firstSlide = await archive.file("ppt/slides/slide1.xml")?.async("string");
        const secondSlide = await archive.file("ppt/slides/slide2.xml")?.async("string");
        const chartFile = archive.file(/^ppt\/charts\/chart\d+\.xml$/)[0];
        const chart = await chartFile?.async("string");

        expect(firstSlide).toContain("Editable Quarterly Review");
        expect(firstSlide).toContain("Revenue increased by 24 percent");
        expect(firstSlide).toContain("<a:tbl>");
        expect(firstSlide).toContain("Quarter");
        expect(secondSlide).toContain("<c:chart");
        expect(secondSlide).toContain("Revenue by quarter");
        expect(chart).toContain("<c:barChart>");
    });

    test("uses a native radar chart for polar-area source data", async () => {
        const pptx = await buildEditablePptx({
            ...presentation,
            slides: [
                {
                    id: "polar-chart",
                    type: "chart",
                    chartConfig: {
                        type: "polarArea",
                        data: {
                            labels: ["Quality", "Speed", "Cost"],
                            datasets: [{ label: "Score", data: [8, 6, 7] }],
                        },
                    },
                },
            ],
            totalSlides: 1,
        });
        const output = await pptx.write({ outputType: "arraybuffer" });
        const archive = await JSZip.loadAsync(output as ArrayBuffer);
        const chartFile = archive.file(/^ppt\/charts\/chart\d+\.xml$/)[0];
        const chart = await chartFile?.async("string");

        expect(chart).toContain("<c:radarChart>");
        expect(chart).toContain("Quality");
    });
});
