import { beforeEach, describe, expect, it, mock } from "bun:test";

const repository = {
    list: mock(),
    find: mock(),
    getSelection: mock(),
    setSelection: mock(),
    upsert: mock(),
    delete: mock(),
    markInvalid: mock(),
    markUsed: mock(),
};

const userRepository = {
    findById: mock(),
};

const decryptApiKey = mock();
const validateProviderKey = mock();

mock.module("@/database", () => ({
    AIConnectionRepository: class {
        list = repository.list;
        find = repository.find;
        getSelection = repository.getSelection;
        setSelection = repository.setSelection;
        upsert = repository.upsert;
        delete = repository.delete;
        markInvalid = repository.markInvalid;
        markUsed = repository.markUsed;
    },
    UserRepository: userRepository,
}));

mock.module("../../services/ai-credential-encryption", () => ({
    decryptApiKey,
    encryptApiKey: mock(),
}));

class ProviderValidationError extends Error {
    readonly rejected: boolean;
    readonly incompatible: boolean;

    constructor(message: string, kind: "rejected" | "incompatible" | "unavailable") {
        super(message);
        this.rejected = kind === "rejected";
        this.incompatible = kind === "incompatible";
    }
}

mock.module("../../services/ai/provider-validation", () => ({
    ProviderValidationError,
    validateProviderKey,
}));

const { AIConnectionService } = await import("../../services/ai-connections.service");

describe("AIConnectionService generation resolution", () => {
    beforeEach(() => {
        repository.list.mockReset();
        repository.find.mockReset();
        repository.getSelection.mockReset();
        repository.setSelection.mockReset();
        repository.markInvalid.mockReset();
        userRepository.findById.mockReset();
        decryptApiKey.mockReset();
        validateProviderKey.mockReset();
        validateProviderKey.mockImplementation((provider: "openai" | "google" | "anthropic") =>
            Promise.resolve([
                {
                    provider,
                    model:
                        provider === "openai"
                            ? "gpt-4.1"
                            : provider === "google"
                              ? "gemini-2.5-flash"
                              : "claude-sonnet-4-5-20250929",
                    label: "Provider model",
                    description: "Discovered from provider",
                    recommended: true,
                },
            ])
        );
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
        expect(validateProviderKey).toHaveBeenCalledWith("openai", "decrypted-key", undefined);
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
        expect(validateProviderKey).toHaveBeenCalledWith("google", "google-key", undefined);
    });

    it("returns the connected provider's live model catalog and repairs stale preferences", async () => {
        const connection = {
            provider: "google",
            status: "valid",
            keyLastFour: "5678",
            validatedAt: new Date("2026-01-01T00:00:00.000Z"),
            lastUsedAt: null,
        };
        repository.list.mockResolvedValue([connection]);
        repository.getSelection.mockResolvedValue({
            provider: "google",
            model: "gemini-retired",
        });
        userRepository.findById.mockResolvedValue({ slideTokens: 100 });
        decryptApiKey.mockResolvedValue("google-key");

        const configuration = await new AIConnectionService().getConfiguration("user_1");

        expect(configuration.models.map((model) => model.model)).toEqual(["gemini-2.5-flash"]);
        expect(configuration.selection).toEqual({
            provider: "google",
            model: "gemini-2.5-flash",
        });
        expect(repository.setSelection).toHaveBeenCalledWith("user_1", {
            provider: "google",
            model: "gemini-2.5-flash",
        });
    });

    it("rejects a model that the connected provider no longer lists", async () => {
        const connection = {
            provider: "openai",
            status: "valid",
            keyLastFour: "1234",
            validatedAt: new Date("2026-01-01T00:00:00.000Z"),
            lastUsedAt: null,
        };
        userRepository.findById.mockResolvedValue({ slideTokens: 100 });
        repository.find.mockResolvedValue(connection);
        decryptApiKey.mockResolvedValue("openai-key");

        await expect(
            new AIConnectionService().select("user_1", {
                provider: "openai",
                model: "gpt-retired",
            })
        ).rejects.toThrow("Unsupported AI model");
        expect(repository.setSelection).not.toHaveBeenCalled();
    });

    it("keeps settings usable and marks a rejected provider invalid", async () => {
        const connection = {
            provider: "anthropic",
            status: "valid",
            keyLastFour: "9876",
            validatedAt: new Date("2026-01-01T00:00:00.000Z"),
            lastUsedAt: null,
        };
        repository.list.mockResolvedValue([connection]);
        repository.getSelection.mockResolvedValue({
            provider: "anthropic",
            model: "claude-retired",
        });
        userRepository.findById.mockResolvedValue({ slideTokens: 100 });
        decryptApiKey.mockResolvedValue("revoked-key");
        validateProviderKey.mockRejectedValue(
            new ProviderValidationError("Provider rejected key", "rejected")
        );

        const configuration = await new AIConnectionService().getConfiguration("user_1");

        expect(configuration.generation.mode).toBe("openrouter");
        expect(configuration.connections[0]?.status).toBe("invalid");
        expect(configuration.modelCatalogErrors?.anthropic).toContain("rejected");
        expect(repository.markInvalid).toHaveBeenCalledWith("user_1", "anthropic");
    });
});
