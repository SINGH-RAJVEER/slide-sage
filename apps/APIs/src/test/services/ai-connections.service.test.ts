import { beforeEach, describe, expect, it, mock } from "bun:test";

const repository = {
    list: mock(),
    find: mock(),
    getSelection: mock(),
    setSelection: mock(),
    upsert: mock(),
    delete: mock(),
    markUsed: mock(),
};

const userRepository = {
    findById: mock(),
};

const decryptApiKey = mock();

mock.module("@slide-sage/database", () => ({
    AIConnectionRepository: class {
        list = repository.list;
        find = repository.find;
        getSelection = repository.getSelection;
        setSelection = repository.setSelection;
        upsert = repository.upsert;
        delete = repository.delete;
        markUsed = repository.markUsed;
    },
    UserRepository: userRepository,
}));

mock.module("../../services/ai-credential-encryption", () => ({
    decryptApiKey,
    encryptApiKey: mock(),
}));

const { AIConnectionService } = await import("../../services/ai-connections.service");

describe("AIConnectionService generation resolution", () => {
    beforeEach(() => {
        repository.list.mockReset();
        repository.find.mockReset();
        repository.getSelection.mockReset();
        repository.setSelection.mockReset();
        userRepository.findById.mockReset();
        decryptApiKey.mockReset();
        process.env["OPEN_ROUTER_MODEL"] = "openrouter/default-model";
    });

    it("uses point-funded OpenRouter when no provider is connected", async () => {
        repository.list.mockResolvedValue([]);
        userRepository.findById.mockResolvedValue({ slideTokens: 20 });
        const service = new AIConnectionService();

        expect(await service.resolveSelection("user_1")).toBeUndefined();
        expect(await service.getConfiguration("user_1")).toEqual(
            expect.objectContaining({
                generation: {
                    mode: "openrouter",
                    model: "openrouter/default-model",
                    billing: "points",
                },
                selection: null,
            })
        );
    });

    it("uses an existing BYOK selection without reapplying the points threshold", async () => {
        const connection = {
            provider: "openai",
            status: "valid",
            keyLastFour: "1234",
            validatedAt: new Date("2026-01-01T00:00:00.000Z"),
            lastUsedAt: null,
        };
        repository.list.mockResolvedValue([connection]);
        repository.getSelection.mockResolvedValue({ provider: "openai", model: "gpt-4.1" });
        repository.find.mockResolvedValue(connection);
        decryptApiKey.mockResolvedValue("decrypted-key");

        await expect(new AIConnectionService().resolveSelection("user_1")).resolves.toEqual({
            provider: "openai",
            model: "gpt-4.1",
            apiKey: "decrypted-key",
        });
        expect(userRepository.findById).not.toHaveBeenCalled();
    });

    it("repairs a missing selection from the remaining valid connection", async () => {
        const connection = {
            provider: "google",
            status: "valid",
            keyLastFour: "5678",
            validatedAt: new Date("2026-01-01T00:00:00.000Z"),
            lastUsedAt: null,
        };
        repository.list.mockResolvedValue([connection]);
        repository.getSelection.mockResolvedValue(null);
        repository.find.mockResolvedValue(connection);
        decryptApiKey.mockResolvedValue("google-key");

        await expect(new AIConnectionService().resolveSelection("user_1")).resolves.toEqual({
            provider: "google",
            model: "gemini-2.5-flash",
            apiKey: "google-key",
        });
        expect(repository.setSelection).toHaveBeenCalledWith("user_1", {
            provider: "google",
            model: "gemini-2.5-flash",
        });
    });
});
