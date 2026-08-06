import { beforeEach, describe, expect, it, mock } from "bun:test";

const users = {
	id: "id",
	lastLoginDate: "lastLoginDate",
	slideTokens: "slideTokens",
};

const updates: Array<{ condition: unknown; values: Record<string, unknown> }> = [];
let updateResult: unknown[] = [];
let selectResult: unknown[] = [];

const update = mock();
const select = mock();

function configureDatabaseMocks(): void {
	update.mockImplementation(() => ({
		set: (values: Record<string, unknown>) => ({
			where: (condition: unknown) => ({
				returning: () => {
					updates.push({ condition, values });
					return Promise.resolve(updateResult);
				},
			}),
		}),
	}));
	select.mockImplementation(() => ({
		from: () => ({
			where: () => ({
				limit: () => Promise.resolve(selectResult),
			}),
		}),
	}));
}

function user(slideTokens: number) {
	return {
		id: "user_1",
		name: "Test User",
		email: "test@example.com",
		emailVerified: true,
		image: null,
		slideTokens,
		lastLoginDate: null,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	};
}

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ conditions, op: "and" }),
	eq: (left: unknown, right: unknown) => ({ left, right, op: "eq" }),
	gte: (left: unknown, right: unknown) => ({ left, right, op: "gte" }),
	isNull: (value: unknown) => ({ op: "isNull", value }),
	lt: (left: unknown, right: unknown) => ({ left, right, op: "lt" }),
	lte: (left: unknown, right: unknown) => ({ left, right, op: "lte" }),
	or: (...conditions: unknown[]) => ({ conditions, op: "or" }),
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
		op: "sql",
		strings: Array.from(strings),
		values,
	}),
}));

mock.module("../../db", () => ({
	db: { select, update },
}));

mock.module("../../db/schema", () => ({ users }));

const { UserRepository } = await import("../../repositories/user.repository");

describe("UserRepository point accounting", () => {
	beforeEach(() => {
		updates.length = 0;
		updateResult = [];
		selectResult = [];
		update.mockReset();
		select.mockReset();
		configureDatabaseMocks();
	});

	it("adds points with SQL arithmetic using the supplied transaction", async () => {
		const updatedUser = user(55);
		updateResult = [updatedUser];
		const transaction = { update };

		expect(await UserRepository.addTokens("user_1", 5, transaction)).toBe(updatedUser);
		expect(updates).toHaveLength(1);
		expect(updates[0]?.values["slideTokens"]).toEqual({
			op: "sql",
			strings: ["", " + ", ""],
			values: [users.slideTokens, 5],
		});
		expect(updates[0]?.condition).toEqual({
			left: users.id,
			right: "user_1",
			op: "eq",
		});
	});

	it("deducts points only when the stored balance is sufficient", async () => {
		const updatedUser = user(45);
		updateResult = [updatedUser];

		expect(await UserRepository.deductTokens("user_1", 5)).toBe(updatedUser);
		expect(updates[0]?.values["slideTokens"]).toEqual({
			op: "sql",
			strings: ["", " - ", ""],
			values: [users.slideTokens, 5],
		});
		expect(updates[0]?.condition).toEqual({
			conditions: [
				{ left: users.id, right: "user_1", op: "eq" },
				{ left: users.slideTokens, right: 5, op: "gte" },
			],
			op: "and",
		});
	});

	it("claims the daily bonus with conditional SQL arithmetic", async () => {
		const updatedUser = user(44);
		updateResult = [updatedUser];

		expect(await UserRepository.awardDailyLoginBonus("user_1")).toEqual({
			awarded: true,
			user: updatedUser,
		});
		expect(updates[0]?.values["slideTokens"]).toEqual({
			op: "sql",
			strings: ["", " + ", ""],
			values: [users.slideTokens, 2],
		});
		expect(updates[0]?.condition).toEqual(
			expect.objectContaining({
				op: "and",
				conditions: expect.arrayContaining([
					{ left: users.id, right: "user_1", op: "eq" },
					expect.objectContaining({ op: "or" }),
				]),
			})
		);
	});

	it("distinguishes insufficient points from a missing user after a failed claim", async () => {
		selectResult = [{ id: "user_1", slideTokens: 3 }];
		expect(UserRepository.deductTokens("user_1", 5)).rejects.toThrow("Insufficient tokens");

		selectResult = [];
		expect(UserRepository.deductTokens("missing", 5)).rejects.toThrow("User not found");
	});

	it("rejects non-finite and non-positive point mutations before querying", async () => {
		expect(UserRepository.addTokens("user_1", Number.NaN)).rejects.toThrow(
			"finite positive number"
		);
		expect(UserRepository.addTokens("user_1", Number.POSITIVE_INFINITY)).rejects.toThrow(
			"finite positive number"
		);
		expect(UserRepository.deductTokens("user_1", 0)).rejects.toThrow("finite positive number");
		expect(UserRepository.deductTokens("user_1", -1)).rejects.toThrow("finite positive number");
		expect(update).not.toHaveBeenCalled();
	});
});
