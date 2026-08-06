/*
 * User Repository
 * Handles user data operations
 */

import { and, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { type Database, db } from "../db";
import { type NewUser, type User, users } from "../db/schema";
import { TokenCalculator } from "../services/token-calculator";

type UserReadDatabase = Pick<Database, "select">;
type UserWriteDatabase = Pick<Database, "update">;

function validateTokenAmount(tokens: number): void {
	if (!Number.isFinite(tokens) || tokens <= 0) {
		throw new Error("Token amount must be a finite positive number");
	}
}

// biome-ignore lint/complexity/noStaticOnlyClass: Repository uses static methods by design.
export class UserRepository {
	/**
	 * Find user by ID
	 */
	static async findById(id: string, database: UserReadDatabase = db): Promise<User | null> {
		const result = await database.select().from(users).where(eq(users.id, id)).limit(1);
		return result[0] || null;
	}

	/**
	 * Find user by email
	 */
	static async findByEmail(email: string): Promise<User | null> {
		const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
		return result[0] || null;
	}

	/**
	 * Create a new user
	 */
	static async create(userData: NewUser): Promise<User> {
		const result = await db.insert(users).values(userData).returning();
		const user = result[0];
		if (!user) {
			throw new Error("Failed to create user");
		}
		return user;
	}

	/**
	 * Ensure user exists with default tokens
	 * Used during OAuth callback/signup
	 */
	static async ensureTokensInitialized(userId: string): Promise<User> {
		const [initializedUser] = await db
			.update(users)
			.set({ slideTokens: 50.0, updatedAt: new Date() })
			.where(and(eq(users.id, userId), lte(users.slideTokens, 0)))
			.returning();

		if (initializedUser) {
			return initializedUser;
		}

		const user = await UserRepository.findById(userId);

		if (!user) {
			throw new Error(`User ${userId} not found`);
		}

		return user;
	}

	/**
	 * Update user fields
	 */
	static async update(id: string, updates: Partial<User>): Promise<User> {
		const result = await db
			.update(users)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(users.id, id))
			.returning();

		if (!result[0]) {
			throw new Error("User not found");
		}

		return result[0];
	}

	/**
	 * Deduct tokens from user account
	 */
	static async deductTokens(userId: string, tokens: number): Promise<User> {
		validateTokenAmount(tokens);

		const [updatedUser] = await db
			.update(users)
			.set({
				slideTokens: sql`${users.slideTokens} - ${tokens}`,
				updatedAt: new Date(),
			})
			.where(and(eq(users.id, userId), gte(users.slideTokens, tokens)))
			.returning();

		if (updatedUser) {
			return updatedUser;
		}

		if (!(await UserRepository.findById(userId))) {
			throw new Error("User not found");
		}

		throw new Error("Insufficient tokens");
	}

	/**
	 * Add tokens to user account
	 */
	static async addTokens(
		userId: string,
		tokens: number,
		database: UserWriteDatabase = db
	): Promise<User> {
		validateTokenAmount(tokens);

		const [updatedUser] = await database
			.update(users)
			.set({
				slideTokens: sql`${users.slideTokens} + ${tokens}`,
				updatedAt: new Date(),
			})
			.where(eq(users.id, userId))
			.returning();

		if (!updatedUser) {
			throw new Error("User not found");
		}

		return updatedUser;
	}

	/**
	 * Check if user has sufficient tokens for generation
	 */
	static async hasSufficientTokens(
		userId: string,
		estimatedTokens: number
	): Promise<{ sufficient: boolean; user: User; shortfall?: number }> {
		const user = await UserRepository.findById(userId);

		if (!user) {
			throw new Error("User not found");
		}

		const validation = TokenCalculator.validateSufficientTokens(user.slideTokens, estimatedTokens);

		return {
			sufficient: validation.sufficient,
			user,
			shortfall: validation.shortfall,
		};
	}

	/**
	 * Award daily login bonus if eligible
	 */
	static async awardDailyLoginBonus(userId: string): Promise<{ awarded: boolean; user: User }> {
		const today = new Date();
		today.setHours(0, 0, 0, 0); // Start of day
		const bonus = TokenCalculator.getDailyLoginBonus();
		validateTokenAmount(bonus);
		const [updatedUser] = await db
			.update(users)
			.set({
				slideTokens: sql`${users.slideTokens} + ${bonus}`,
				lastLoginDate: today,
				updatedAt: new Date(),
			})
			.where(
				and(eq(users.id, userId), or(isNull(users.lastLoginDate), lt(users.lastLoginDate, today)))
			)
			.returning();

		if (updatedUser) {
			return { awarded: true, user: updatedUser };
		}

		const user = await UserRepository.findById(userId);

		if (!user) {
			throw new Error("User not found");
		}

		return { awarded: false, user };
	}

	/**
	 * Get user token balance with display formatting
	 */
	static async getTokenBalance(userId: string): Promise<{
		user: User;
		displayBalance: string;
	}> {
		const user = await UserRepository.findById(userId);

		if (!user) {
			throw new Error("User not found");
		}

		return {
			user,
			displayBalance: user.slideTokens.toFixed(1),
		};
	}

	/**
	 * Refund tokens for failed generation
	 */
	static async refundTokens(
		userId: string,
		estimatedTokens: number,
		actualTokensUsed = 0
	): Promise<User> {
		const user = await UserRepository.findById(userId);

		if (!user) {
			throw new Error("User not found");
		}

		const refundAmount = TokenCalculator.calculateRefund(estimatedTokens, actualTokensUsed);

		if (refundAmount > 0) {
			return await UserRepository.addTokens(userId, refundAmount);
		}

		return user;
	}

	/**
	 * Get user statistics
	 */
	static async getUserStats(userId: string): Promise<{
		user: User;
		totalPresentations: number;
		tokensUsedThisMonth: number;
		averageTokensPerPresentation: number;
	}> {
		const user = await UserRepository.findById(userId);

		if (!user) {
			throw new Error("User not found");
		}

		// TODO: Implement presentation counting and token usage tracking
		// This would require additional database queries or tracking tables

		return {
			user,
			totalPresentations: 0, // Placeholder
			tokensUsedThisMonth: 0, // Placeholder
			averageTokensPerPresentation: 0, // Placeholder
		};
	}
}
