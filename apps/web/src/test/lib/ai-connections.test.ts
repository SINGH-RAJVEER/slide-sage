import { expect, it, mock } from "bun:test";
import { deleteAIProvider } from "@/lib/ai-connections";

it("accepts an empty 204 response when deleting an AI connection", async () => {
	const originalFetch = globalThis.fetch;
	const fetchMock = mock(async () => new Response(null, { status: 204 }));
	globalThis.fetch = fetchMock as unknown as typeof fetch;

	try {
		await expect(deleteAIProvider("openai")).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining("/ai/connections/openai"),
			expect.objectContaining({ method: "DELETE", credentials: "include" }),
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
