import { describe, expect, it } from "bun:test";
import { readPointBalanceStorage } from "../../lib/points";

describe("point balance storage", () => {
	it("accepts only finite numeric balance updates", () => {
		expect(readPointBalanceStorage('{"slideTokens":12.5}')).toBe(12.5);
		expect(readPointBalanceStorage('{"slideTokens":"12.5"}')).toBeNull();
		expect(readPointBalanceStorage("not-json")).toBeNull();
	});
});
