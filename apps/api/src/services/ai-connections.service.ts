import {
    AI_PROVIDERS,
    type AIConfigurationResponse,
    type AIConnectionSummary,
    type AIModelDescriptor,
    type AIModelSelection,
    type AIProvider,
} from "@slidesage/types";
import { AIConnectionRepository, UserRepository } from "@/database";
import { configuredOpenRouterModel, findAIModel, modelsForProvider } from "./ai/model-catalog";
import { validateProviderKey } from "./ai/provider-validation";
import { decryptApiKey, encryptApiKey } from "./ai-credential-encryption";

export class AIConnectionService {
    private repository = new AIConnectionRepository();

    async requireEligibility(userId: string): Promise<number> {
        const user = await UserRepository.findById(userId);
        if (!user) throw new Error("User not found");
        if (user.slideTokens <= 50) {
            const error = new Error("Provider connections require more than 50 points.");
            error.name = "BYOKPointsRequiredError";
            throw error;
        }
        return user.slideTokens;
    }

    async getConfiguration(userId: string): Promise<AIConfigurationResponse> {
        const user = await UserRepository.findById(userId);
        if (!user) throw new Error("User not found");
        const connections = await this.repository.list(userId);
        const validProviders = new Set(
            connections.filter((connection) => connection.status === "valid").map((c) => c.provider)
        );
        const models = Array.from(validProviders).flatMap((provider) =>
            modelsForProvider(provider as AIProvider)
        );
        const selection = await this.repository.getSelection(userId);
        let validSelection =
            selection &&
            validProviders.has(selection.provider) &&
            findAIModel(selection.provider, selection.model)
                ? selection
                : null;
        if (!validSelection && validProviders.size > 0) {
            validSelection = this.defaultSelection(validProviders);
            if (validSelection) await this.repository.setSelection(userId, validSelection);
        }
        return {
            generation: {
                mode: validProviders.size > 0 ? "byok" : "openrouter",
                model:
                    validProviders.size > 0
                        ? validSelection?.model || null
                        : configuredOpenRouterModel(),
                billing: validProviders.size > 0 ? "provider" : "points",
            },
            eligibility: {
                eligible: user.slideTokens > 50,
                slideTokens: user.slideTokens,
                minimumPointsExclusive: 50,
            },
            connections: connections.map((connection) => this.summary(connection)),
            models,
            selection: validSelection,
        };
    }

    async connect(
        userId: string,
        provider: AIProvider,
        apiKey: string,
        signal?: AbortSignal
    ): Promise<{ connection: AIConnectionSummary; availableModels: AIModelDescriptor[] }> {
        await this.requireEligibility(userId);
        const normalized = apiKey.trim();
        if (normalized.length < 8 || normalized.length > 512 || /[\r\n\0]/.test(normalized)) {
            throw new Error("Enter a valid API key.");
        }
        const availableModels = await validateProviderKey(provider, normalized, signal);
        const connection = await this.repository.upsert(
            userId,
            provider,
            await encryptApiKey(userId, provider, normalized)
        );
        if (availableModels.length > 0) {
            const current = await this.repository.getSelection(userId);
            if (!current) {
                const recommended =
                    availableModels.find((model) => model.recommended) || availableModels[0];
                if (recommended) {
                    await this.repository.setSelection(userId, recommended);
                }
            }
        }
        return { connection: this.summary(connection), availableModels };
    }

    async delete(userId: string, provider: AIProvider): Promise<void> {
        await this.repository.delete(userId, provider);
    }

    async select(userId: string, selection: AIModelSelection): Promise<void> {
        await this.requireEligibility(userId);
        if (!findAIModel(selection.provider, selection.model))
            throw new Error("Unsupported AI model");
        const connection = await this.repository.find(userId, selection.provider);
        if (!connection || connection.status !== "valid")
            throw new Error("Connect this provider first");
        await this.repository.setSelection(userId, selection);
    }

    async resolveSelection(
        userId: string,
        requested?: AIModelSelection
    ): Promise<(AIModelSelection & { apiKey: string }) | undefined> {
        const connections = await this.repository.list(userId);
        const validProviders = new Set(
            connections.filter((connection) => connection.status === "valid").map((c) => c.provider)
        );
        if (validProviders.size === 0) {
            if (requested) throw new Error("The selected AI provider is not connected.");
            return undefined;
        }
        let selection = requested || (await this.repository.getSelection(userId));
        if (
            !requested &&
            (!selection ||
                !validProviders.has(selection.provider) ||
                !findAIModel(selection.provider, selection.model))
        ) {
            selection = this.defaultSelection(validProviders);
            if (selection) await this.repository.setSelection(userId, selection);
        }
        if (!selection || !findAIModel(selection.provider, selection.model)) {
            throw new Error("Select a connected AI model before generating.");
        }
        const connection = await this.repository.find(userId, selection.provider);
        if (!connection || connection.status !== "valid") {
            throw new Error("The selected AI provider is not connected.");
        }
        return {
            ...selection,
            apiKey: await decryptApiKey(userId, selection.provider, connection),
        };
    }

    async markUsed(userId: string, provider: AIProvider): Promise<void> {
        await this.repository.markUsed(userId, provider);
    }

    private defaultSelection(validProviders: Set<string>): AIModelSelection | null {
        for (const provider of AI_PROVIDERS) {
            if (!validProviders.has(provider)) continue;
            const models = modelsForProvider(provider);
            const model = models.find((candidate) => candidate.recommended) || models[0];
            if (model) return { provider: model.provider, model: model.model };
        }
        return null;
    }

    private summary(connection: {
        provider: string;
        status: string;
        keyLastFour: string;
        validatedAt: Date;
        lastUsedAt: Date | null;
    }): AIConnectionSummary {
        return {
            provider: connection.provider as AIProvider,
            status: connection.status as "valid" | "invalid",
            keyHint: `••••${connection.keyLastFour}`,
            validatedAt: connection.validatedAt.toISOString(),
            ...(connection.lastUsedAt ? { lastUsedAt: connection.lastUsedAt.toISOString() } : {}),
        };
    }
}
