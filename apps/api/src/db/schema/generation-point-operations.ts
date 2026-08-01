import { sql } from "drizzle-orm";
import { check, index, pgTable, real, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { presentations } from "./presentation";

export const generationPointOperations = pgTable(
    "generation_point_operations",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        presentationId: text("presentation_id").references(() => presentations.id, {
            onDelete: "set null",
        }),
        kind: varchar("kind", { length: 20 }).notNull(),
        status: varchar("status", { length: 20 }).notNull().default("reserved"),
        quotedPoints: real("quoted_points").notNull(),
        chargedPoints: real("charged_points"),
        balanceAfter: real("balance_after"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at")
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
        finalizedAt: timestamp("finalized_at"),
        expiresAt: timestamp("expires_at").notNull().default(sql`NOW() + INTERVAL '1 hour'`),
    },
    (table) => ({
        userIdIndex: index("generation_point_operations_user_id_idx").on(table.userId),
        presentationIdIndex: index("generation_point_operations_presentation_id_idx").on(
            table.presentationId
        ),
        expiresAtIndex: index("generation_point_operations_expires_at_idx").on(table.expiresAt),
        kindCheck: check(
            "generation_point_operations_kind_check",
            sql`${table.kind} IN ('generation', 'iteration')`
        ),
        statusCheck: check(
            "generation_point_operations_status_check",
            sql`${table.status} IN ('reserved', 'settled', 'refunded')`
        ),
        quoteCheck: check(
            "generation_point_operations_quote_check",
            sql`${table.quotedPoints} >= 0`
        ),
        chargeCheck: check(
            "generation_point_operations_charge_check",
            sql`${table.chargedPoints} IS NULL OR (${table.chargedPoints} >= 0 AND ${table.chargedPoints} <= ${table.quotedPoints})`
        ),
    })
);

export type GenerationPointOperation = typeof generationPointOperations.$inferSelect;
