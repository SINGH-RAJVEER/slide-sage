import { db, payments, UserRepository } from "@slide-sage/database";
import type {
    BillingBalanceResponse,
    BillingCheckoutRequest,
    BillingCheckoutResponse,
    BillingVerifyRequest,
    BillingVerifyResponse,
} from "@slide-sage/types";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { authMiddleware, getCurrentUserId } from "../services/auth";
import {
    createOrder,
    resolvePackPrice,
    verifyPaymentSignature,
    verifyWebhookSignature,
} from "../services/razorpay.service";

const billing = new Hono();

billing.get("/balance", authMiddleware, async (c) => {
    try {
        const userId = getCurrentUserId(c);
        const { user } = await UserRepository.getTokenBalance(userId);

        return c.json({
            slide_tokens: user.slideTokens,
        } satisfies BillingBalanceResponse);
    } catch (error) {
        console.error("Balance error:", error instanceof Error ? error.message : String(error));
        return c.json({ error: { message: "Internal server error" } }, 500);
    }
});

billing.post("/checkout", authMiddleware, async (c) => {
    try {
        const userId = getCurrentUserId(c);
        const body = await c.req.json().catch(() => ({}));
        const { pack, quantity } = body as Partial<BillingCheckoutRequest>;

        if (!pack || !["starter", "pro", "premium", "custom"].includes(pack)) {
            return c.json({ error: { message: "Invalid pack" } }, 400);
        }

        if (pack === "custom") {
            if (!quantity || typeof quantity !== "number" || quantity < 10 || quantity > 1000) {
                return c.json({ error: { message: "Custom quantity must be 10–1000" } }, 400);
            }
        }

        const { tokens, amountPaise } = resolvePackPrice(pack, quantity);
        const order = await createOrder(userId, pack, quantity);

        await db.insert(payments).values({
            userId,
            razorpayOrderId: order.orderId,
            amountPaise,
            tokensGranted: tokens,
            status: "created",
        });

        return c.json({
            orderId: order.orderId,
            amount: order.amount,
            currency: order.currency,
            tokens: order.tokens,
            keyId: order.keyId,
        } satisfies BillingCheckoutResponse);
    } catch (error) {
        console.error("Checkout error:", error instanceof Error ? error.message : String(error));
        return c.json({ error: { message: "Failed to create order" } }, 500);
    }
});

billing.post("/verify", authMiddleware, async (c) => {
    try {
        const userId = getCurrentUserId(c);
        const body = await c.req.json().catch(() => ({}));
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
            body as Partial<BillingVerifyRequest>;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return c.json({ error: { message: "Missing payment details" } }, 400);
        }

        const isValid = verifyPaymentSignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );

        if (!isValid) {
            return c.json({ error: { message: "Invalid payment signature" } }, 400);
        }

        const existing = await db
            .select()
            .from(payments)
            .where(eq(payments.razorpayOrderId, razorpay_order_id))
            .limit(1);

        const payment = existing[0];

        if (!payment) {
            return c.json({ error: { message: "Order not found" } }, 404);
        }

        if (payment.userId !== userId) {
            return c.json({ error: { message: "Unauthorized" } }, 403);
        }

        if (payment.status === "paid") {
            const user = await UserRepository.findById(userId);
            return c.json({
                success: true,
                tokens_awarded: payment.tokensGranted,
                new_balance: user?.slideTokens ?? 0,
            } satisfies BillingVerifyResponse);
        }

        await db
            .update(payments)
            .set({ razorpayPaymentId: razorpay_payment_id, status: "paid" })
            .where(eq(payments.razorpayOrderId, razorpay_order_id));

        const updatedUser = await UserRepository.addTokens(userId, payment.tokensGranted);

        return c.json({
            success: true,
            tokens_awarded: payment.tokensGranted,
            new_balance: updatedUser.slideTokens,
        } satisfies BillingVerifyResponse);
    } catch (error) {
        console.error("Verify error:", error instanceof Error ? error.message : String(error));
        return c.json({ error: { message: "Payment verification failed" } }, 500);
    }
});

billing.post("/webhook", async (c) => {
    try {
        const rawBody = await c.req.text();
        const signature = c.req.header("x-razorpay-signature") ?? "";

        if (!verifyWebhookSignature(rawBody, signature)) {
            return c.json({ error: { message: "Invalid webhook signature" } }, 400);
        }

        const event = JSON.parse(rawBody) as {
            event: string;
            payload?: {
                payment?: {
                    entity?: {
                        id?: string;
                        order_id?: string;
                        status?: string;
                    };
                };
            };
        };

        if (event.event === "payment.captured") {
            const paymentEntity = event.payload?.payment?.entity;
            const orderId = paymentEntity?.order_id;
            const paymentId = paymentEntity?.id;

            if (!orderId || !paymentId) {
                return c.json({ status: "ok" });
            }

            const existing = await db
                .select()
                .from(payments)
                .where(eq(payments.razorpayOrderId, orderId))
                .limit(1);

            const payment = existing[0];

            if (payment && payment.status !== "paid") {
                await db
                    .update(payments)
                    .set({ razorpayPaymentId: paymentId, status: "paid" })
                    .where(eq(payments.razorpayOrderId, orderId));

                await UserRepository.addTokens(payment.userId, payment.tokensGranted);
            }
        }

        return c.json({ status: "ok" });
    } catch (error) {
        console.error("Webhook error:", error instanceof Error ? error.message : String(error));
        return c.json({ error: { message: "Webhook processing failed" } }, 500);
    }
});

export default billing;
