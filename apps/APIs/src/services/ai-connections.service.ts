import { AIConnectionRepository, UserRepository } from "@slide-sage/database";
import type {
    AIConfigurationResponse,
    AIConnectionSummary,
    AIModelDescriptor,
    AIModelSelection,
    AIProvider,
} from "@slide-sage/types";
import { findAIModel, modelsForProvider } from "./ai/model-catalog";
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
        return {
            eligibility: {
                eligible: user.slideTokens > 50,
                slideTokens: user.slideTokens,
                minimumPointsExclusive: 50,
            },
            connections: connections.map((connection) => this.summary(connection)),
            models,
            selection:
                selection &&
                validProviders.has(selection.provider) &&
                findAIModel(selection.provider, selection.model)
                    ? selection
                    : null,
        };
    }

    async connect(
        userId: string,
        provider: AIProvider,
        apiKey: string
    ): Promise<{ connection: AIConnectionSummary; availableModels: AIModelDescriptor[] }> {
        await this.requireEligibility(userId);
        const normalized = apiKey.trim();
        if (normalized.length < 8 || normalized.length > 512 || /[\r\n\0]/.test(normalized)) {
            throw new Error("Enter a valid API key.");
        }
        const availableModels = await validateProviderKey(provider, normalized);
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
    ): Promise<AIModelSelection & { apiKey: string }> {
        await this.requireEligibility(userId);
        const selection = requested || (await this.repository.getSelection(userId));
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
