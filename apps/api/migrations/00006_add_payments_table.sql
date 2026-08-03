-- +goose Up
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"razorpay_order_id" text NOT NULL,
	"razorpay_payment_id" text,
	"amount_paise" integer NOT NULL,
	"tokens_granted" real NOT NULL,
	"status" varchar(50) DEFAULT 'created' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_razorpay_order_id_unique" UNIQUE("razorpay_order_id"),
	CONSTRAINT "payments_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
