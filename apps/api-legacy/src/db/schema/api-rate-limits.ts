import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	primaryKey,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";

export const apiRateLimits = pgTable(
	"api_rate_limits",
	{
		scope: varchar("scope", { length: 80 }).notNull(),
		keyHash: varchar("key_hash", { length: 64 }).notNull(),
		windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
		requestCount: integer("request_count").notNull().default(1),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	},
	(table) => ({
		primaryKey: primaryKey({ columns: [table.scope, table.keyHash, table.windowStart] }),
		expiresAtIndex: index("api_rate_limits_expires_at_idx").on(table.expiresAt),
		requestCountCheck: check("api_rate_limits_request_count_check", sql`${table.requestCount} > 0`),
	})
);

export type ApiRateLimit = typeof apiRateLimits.$inferSelect;
