import { integer, pgTable, real, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const payments = pgTable("payments", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    razorpayOrderId: text("razorpay_order_id").notNull().unique(),
    razorpayPaymentId: text("razorpay_payment_id").unique(),
    amountPaise: integer("amount_paise").notNull(),
    tokensGranted: real("tokens_granted").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("created"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
