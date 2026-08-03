import {
    AI_PROVIDERS,
    type AIConfigurationResponse,
    type AIConnectionSummary,
    type AIModelDescriptor,
    type AIModelSelection,
    type AIProvider,
} from "@slidesage/types";
import { AIConnectionRepository, UserRepository } from "@/database";
import { configuredOpenRouterModel } from "./ai/model-catalog";
import { ProviderValidationError, validateProviderKey } from "./ai/provider-validation";
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

    async getConfiguration(userId: string, signal?: AbortSignal): Promise<AIConfigurationResponse> {
        const user = await UserRepository.findById(userId);
        if (!user) throw new Error("User not found");
        const connections = await this.repository.list(userId);
        const validConnections = connections.filter((connection) => connection.status === "valid");
        const invalidProviders = new Set<AIProvider>();
        const transientProviders = new Set<AIProvider>();
        const modelCatalogErrors: Partial<Record<AIProvider, string>> = {};
        const discoveries = await Promise.all(
            validConnections.map(async (connection) => {
                const provider = connection.provider as AIProvider;
                try {
                    return await this.discoverModels(userId, provider, connection, signal);
                } catch (error) {
                    if (
                        error instanceof ProviderValidationError &&
                        (error.rejected || error.incompatible)
                    ) {
                        invalidProviders.add(provider);
                        modelCatalogErrors[provider] = error.rejected
                            ? "The provider rejected this API key. Replace it to refresh models."
                            : "The provider no longer lists a compatible generation model.";
                    } else {
                        transientProviders.add(provider);
                        modelCatalogErrors[provider] =
                            "The provider model list is temporarily unavailable.";
                    }
                    return { apiKey: "", models: [] };
                }
            })
        );
        const models = discoveries.flatMap((discovery) => discovery.models);
        const validProviders = new Set(
            validConnections
                .map((connection) => connection.provider as AIProvider)
                .filter((provider) => !invalidProviders.has(provider))
        );
        const availableSelections = new Set(
            models.map((model) => `${model.provider}\0${model.model}`)
        );
        const selection = await this.repository.getSelection(userId);
        let validSelection =
            selection &&
            validProviders.has(selection.provider) &&
            (availableSelections.has(`${selection.provider}\0${selection.model}`) ||
                transientProviders.has(selection.provider))
                ? selection
                : null;
        if (!validSelection && validProviders.size > 0) {
            validSelection = this.defaultSelection(models);
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
            connections: connections.map((connection) =>
                this.summary({
                    ...connection,
                    status: invalidProviders.has(connection.provider as AIProvider)
                        ? "invalid"
                        : connection.status,
                })
            ),
            models,
            ...(Object.keys(modelCatalogErrors).length > 0 ? { modelCatalogErrors } : {}),
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

    async select(userId: string, selection: AIModelSelection, signal?: AbortSignal): Promise<void> {
        await this.requireEligibility(userId);
        const connection = await this.repository.find(userId, selection.provider);
        if (!connection || connection.status !== "valid")
            throw new Error("Connect this provider first");
        const { models } = await this.discoverModels(
            userId,
            selection.provider,
            connection,
            signal
        );
        if (!models.some((model) => model.model === selection.model)) {
            throw new Error("Unsupported AI model");
        }
        await this.repository.setSelection(userId, selection);
    }

    async resolveSelection(
        userId: string,
        requested?: AIModelSelection,
        signal?: AbortSignal
    ): Promise<(AIModelSelection & { apiKey: string }) | undefined> {
        const connections = await this.repository.list(userId);
        const validConnections = connections.filter((connection) => connection.status === "valid");
        if (validConnections.length === 0) {
            if (requested) throw new Error("The selected AI provider is not connected.");
            return undefined;
        }
        const selection = requested || (await this.repository.getSelection(userId));
        const selectedConnection = selection
            ? validConnections.find((connection) => connection.provider === selection.provider)
            : undefined;
        if (requested && !selectedConnection) {
            throw new Error("The selected AI provider is not connected.");
        }

        if (selection && selectedConnection) {
            const provider = selection.provider;
            const { apiKey, models } = await this.discoverModels(
                userId,
                provider,
                selectedConnection,
                signal
            );
            if (models.some((model) => model.model === selection?.model)) {
                return { ...selection, apiKey };
            }
            if (requested) throw new Error("The selected AI model is no longer available.");
        }

        for (const provider of AI_PROVIDERS) {
            const connection = validConnections.find((entry) => entry.provider === provider);
            if (!connection) continue;
            const { apiKey, models } = await this.discoverModels(
                userId,
                provider,
                connection,
                signal
            );
            const fallback = this.defaultSelection(models);
            if (!fallback) continue;
            await this.repository.setSelection(userId, fallback);
            return { ...fallback, apiKey };
        }

        throw new Error("Select a connected AI model before generating.");
    }

    async markUsed(userId: string, provider: AIProvider): Promise<void> {
        await this.repository.markUsed(userId, provider);
    }

    private async discoverModels(
        userId: string,
        provider: AIProvider,
        connection: {
            encryptedApiKey: string;
            encryptionIv: string;
            encryptionKeyVersion: number;
        },
        signal?: AbortSignal
    ): Promise<{ apiKey: string; models: AIModelDescriptor[] }> {
        const apiKey = await decryptApiKey(userId, provider, connection);
        try {
            return {
                apiKey,
                models: await validateProviderKey(provider, apiKey, signal),
            };
        } catch (error) {
            if (
                error instanceof ProviderValidationError &&
                (error.rejected || error.incompatible)
            ) {
                await this.repository.markInvalid(userId, provider);
            }
            throw error;
        }
    }

    private defaultSelection(models: AIModelDescriptor[]): AIModelSelection | null {
        for (const provider of AI_PROVIDERS) {
            const providerModels = models.filter((model) => model.provider === provider);
            const model =
                providerModels.find((candidate) => candidate.recommended) || providerModels[0];
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
