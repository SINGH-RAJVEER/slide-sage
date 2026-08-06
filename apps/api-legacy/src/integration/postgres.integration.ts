import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
	apiRateLimits,
	createDatabase,
	generationPointOperations,
	presentations,
	runWithDatabase,
	users,
} from "../db";
import { consumeRateLimit } from "../middleware/rate-limit";
import { GenerationPointOperationRepository } from "../repositories/generation-point-operation.repository";
import { UserRepository } from "../repositories/user.repository";

const connectionString = process.env["TEST_DATABASE_URL"];
const integrationDescribe = connectionString ? describe : describe.skip;

integrationDescribe("PostgreSQL accounting integration", () => {
	const userId = `integration-user-${crypto.randomUUID()}`;
	const email = `${userId}@example.test`;
	const presentationId = `integration-presentation-${crypto.randomUUID()}`;
	const rateLimitScope = `integration:${crypto.randomUUID()}`;
	let database: ReturnType<typeof createDatabase>;

	beforeAll(async () => {
		const databaseName = new URL(connectionString as string).pathname.toLowerCase();
		if (!databaseName.includes("test")) {
			throw new Error("TEST_DATABASE_URL must point to a database whose name contains 'test'");
		}

		database = createDatabase(connectionString as string, { max: 10 });
		await migrate(database.db, {
			migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
		});
		await database.db.insert(users).values({
			id: userId,
			name: "Integration User",
			email,
			emailVerified: true,
			slideTokens: 100,
		});
	});

	afterAll(async () => {
		await database.db.delete(apiRateLimits).where(eq(apiRateLimits.scope, rateLimitScope));
		await database.db.delete(users).where(eq(users.id, userId));
		await database.client.end({ timeout: 5 });
	});

	it("preserves concurrent credits and prevents concurrent overspending", async () => {
		await runWithDatabase(database.db, async () => {
			await Promise.all(Array.from({ length: 20 }, () => UserRepository.addTokens(userId, 1)));
			expect((await UserRepository.findById(userId))?.slideTokens).toBe(120);

			const deductions = await Promise.allSettled([
				UserRepository.deductTokens(userId, 80),
				UserRepository.deductTokens(userId, 80),
			]);
			expect(deductions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
			expect(deductions.filter((result) => result.status === "rejected")).toHaveLength(1);
			expect((await UserRepository.findById(userId))?.slideTokens).toBe(40);
		});
	});

	it("increments one shared rate-limit window atomically", async () => {
		await runWithDatabase(database.db, async () => {
			const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000);
			const expiresAt = new Date(windowStart.getTime() + 60_000);
			const counts = await Promise.all(
				Array.from({ length: 20 }, () =>
					consumeRateLimit({
						scope: rateLimitScope,
						keyHash: "a".repeat(64),
						windowStart,
						expiresAt,
					})
				)
			);

			expect(Math.max(...counts)).toBe(20);
			expect(new Set(counts).size).toBe(20);
		});
	});

	it("recovers an expired generation reservation exactly once", async () => {
		await database.db.update(users).set({ slideTokens: 90 }).where(eq(users.id, userId));
		await database.db.insert(presentations).values({
			id: presentationId,
			userId,
			title: "Expired reservation",
			prompt: "Integration test",
			slidesData: { slides: [], theme: "corporate-blue" },
		});
		await database.db.insert(generationPointOperations).values({
			id: crypto.randomUUID(),
			userId,
			presentationId,
			kind: "generation",
			status: "reserved",
			quotedPoints: 10,
			expiresAt: new Date(Date.now() - 1_000),
		});

		await runWithDatabase(database.db, async () => {
			const repository = new GenerationPointOperationRepository();
			expect(await repository.getBalance(userId)).toBe(100);
			expect(await repository.getBalance(userId)).toBe(100);
		});
	});
});
