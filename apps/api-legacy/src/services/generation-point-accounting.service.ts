import type { PresentationJSON } from "@slidesage/types";
import type { Presentation } from "../db/schema";
import {
    GenerationPointOperationRepository,
    InsufficientGenerationPointsError,
    PresentationFinalizationConflictError,
} from "../repositories/generation-point-operation.repository";

export { InsufficientGenerationPointsError, PresentationFinalizationConflictError };

export class GenerationPointAccountingService {
    private repository = new GenerationPointOperationRepository();

    private validateQuote(quotedPoints: number): void {
        if (
            !Number.isFinite(quotedPoints) ||
            quotedPoints < 0 ||
            quotedPoints > Number.MAX_SAFE_INTEGER
        ) {
            throw new Error("Invalid generation point quote");
        }
    }

    async getBalance(userId: string): Promise<number> {
        return await this.repository.getBalance(userId);
    }

    async reserveNewPresentation(input: {
        operationId: string;
        userId: string;
        title: string;
        prompt: string;
        slidesData: PresentationJSON;
        quotedPoints: number;
    }): Promise<{ presentation: Presentation; balance: number }> {
        this.validateQuote(input.quotedPoints);
        return await this.repository.reserveNewPresentation(input);
    }

    async reserveExistingPresentation(input: {
        operationId: string;
        userId: string;
        presentationId: string;
        kind: "generation" | "iteration";
        quotedPoints: number;
    }): Promise<{ balance: number }> {
        this.validateQuote(input.quotedPoints);
        return await this.repository.reserveExistingPresentation(input);
    }

    async finalizePresentation(input: {
        operationId: string;
        userId: string;
        presentationId: string;
        chargedPoints: number;
        expectedRevision?: number;
        updates: Partial<Presentation>;
    }): Promise<{ presentation: Presentation; balance: number }> {
        if (
            !Number.isFinite(input.chargedPoints) ||
            input.chargedPoints < 0 ||
            input.chargedPoints > Number.MAX_SAFE_INTEGER
        ) {
            throw new Error("Invalid generation point charge");
        }
        return await this.repository.finalizePresentation(input);
    }

    async refund(operationId: string, userId: string): Promise<number> {
        return await this.repository.refund(operationId, userId);
    }

    async renew(operationId: string, userId: string): Promise<void> {
        await this.repository.renew(operationId, userId);
    }
}
