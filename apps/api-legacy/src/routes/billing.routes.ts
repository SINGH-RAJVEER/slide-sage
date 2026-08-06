import type {
	BillingBalanceResponse,
	BillingCheckoutRequest,
	BillingCheckoutResponse,
	BillingVerifyRequest,
	BillingVerifyResponse,
} from "@slidesage/types";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { db, payments, UserRepository } from "@/database";
import { clientAddress, rateLimit, userRateLimit } from "../middleware/rate-limit";
import { authMiddleware, getCurrentUserId } from "../services/auth";
import { GenerationPointAccountingService } from "../services/generation-point-accounting.service";
import {
	type CapturedRazorpayPayment,
	createOrder,
	fetchRazorpayPayment,
	parseCapturedRazorpayPayment,
	verifyPaymentSignature,
	verifyWebhookSignature,
} from "../services/razorpay.service";
import { logSafeError } from "../utils/safe-logging";

const billing = new Hono();
const billingBodyLimit = bodyLimit({
	maxSize: 32 * 1024,
	onError: (c) => c.json({ error: { message: "Request body is too large" } }, 413),
});
const webhookBodyLimit = bodyLimit({
	maxSize: 256 * 1024,
	onError: (c) => c.json({ error: { message: "Request body is too large" } }, 413),
});
const pointAccounting = new GenerationPointAccountingService();
const checkoutRateLimit = userRateLimit("billing:checkout", 10, 10 * 60);
const verifyRateLimit = userRateLimit("billing:verify", 20, 15 * 60);
const webhookRateLimit = rateLimit([
	{
		scope: "billing:webhook:ip",
		limit: 120,
		windowSeconds: 60,
		identity: clientAddress,
	},
]);

type PaymentFulfillmentResult =
	| { kind: "success"; tokensGranted: number; newBalance: number }
	| { kind: "not-found" }
	| { kind: "unauthorized" }
	| { kind: "invalid" }
	| { kind: "conflict" };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

async function fulfillPayment(
	capturedPayment: CapturedRazorpayPayment,
	expectedUserId?: string
): Promise<PaymentFulfillmentResult> {
	return await db.transaction(async (tx) => {
		const [claimedPayment] = await tx
			.update(payments)
			.set({
				razorpayPaymentId: capturedPayment.paymentId,
				status: "paid",
			})
			.where(
				and(
					eq(payments.razorpayOrderId, capturedPayment.orderId),
					eq(payments.status, "created"),
					eq(payments.amountPaise, capturedPayment.amountPaise),
					expectedUserId ? eq(payments.userId, expectedUserId) : undefined
				)
			)
			.returning();

		if (claimedPayment) {
			const user = await UserRepository.addTokens(
				claimedPayment.userId,
				claimedPayment.tokensGranted,
				tx
			);
			return {
				kind: "success",
				tokensGranted: claimedPayment.tokensGranted,
				newBalance: user.slideTokens,
			};
		}

		const [payment] = await tx
			.select()
			.from(payments)
			.where(eq(payments.razorpayOrderId, capturedPayment.orderId))
			.limit(1);

		if (!payment) {
			return { kind: "not-found" };
		}
		if (expectedUserId && payment.userId !== expectedUserId) {
			return { kind: "unauthorized" };
		}
		if (payment.amountPaise !== capturedPayment.amountPaise) {
			return { kind: "invalid" };
		}
		if (payment.status !== "paid" || payment.razorpayPaymentId !== capturedPayment.paymentId) {
			return { kind: "conflict" };
		}

		const user = await UserRepository.findById(payment.userId, tx);
		if (!user) {
			throw new Error("Payment user not found");
		}

		return {
			kind: "success",
			tokensGranted: payment.tokensGranted,
			newBalance: user.slideTokens,
		};
	});
}

billing.get("/balance", authMiddleware, async (c) => {
	try {
		const userId = getCurrentUserId(c);
		const balance = await pointAccounting.getBalance(userId);

		return c.json({
			slide_tokens: balance,
		} satisfies BillingBalanceResponse);
	} catch (error) {
		logSafeError("billing_balance_failed", error);
		return c.json({ error: { message: "Internal server error" } }, 500);
	}
});

billing.post("/checkout", billingBodyLimit, authMiddleware, checkoutRateLimit, async (c) => {
	try {
		const userId = getCurrentUserId(c);
		const body = await c.req.json().catch(() => ({}));
		const { pack, quantity } = body as Partial<BillingCheckoutRequest>;

		if (!pack || !["starter", "pro", "premium", "custom"].includes(pack)) {
			return c.json({ error: { message: "Invalid pack" } }, 400);
		}

		if (pack === "custom") {
			if (!Number.isSafeInteger(quantity) || (quantity ?? 0) < 25 || (quantity ?? 0) > 2500) {
				return c.json({ error: { message: "Custom quantity must be 25–2500" } }, 400);
			}
		}

		const order = await createOrder(userId, pack, quantity);

		await db.insert(payments).values({
			userId,
			razorpayOrderId: order.orderId,
			amountPaise: order.amount,
			tokensGranted: order.tokens,
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
		logSafeError("billing_checkout_failed", error);
		return c.json({ error: { message: "Failed to create order" } }, 500);
	}
});

billing.post("/verify", billingBodyLimit, authMiddleware, verifyRateLimit, async (c) => {
	try {
		const userId = getCurrentUserId(c);
		const body = await c.req.json().catch(() => ({}));
		const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
			body as Partial<BillingVerifyRequest>;

		if (
			typeof razorpay_order_id !== "string" ||
			razorpay_order_id.length === 0 ||
			typeof razorpay_payment_id !== "string" ||
			razorpay_payment_id.length === 0 ||
			typeof razorpay_signature !== "string" ||
			razorpay_signature.length === 0
		) {
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
			if (payment.razorpayPaymentId !== razorpay_payment_id) {
				return c.json({ error: { message: "Payment is already linked differently" } }, 409);
			}
			const fulfillment = await fulfillPayment(
				{
					paymentId: razorpay_payment_id,
					orderId: razorpay_order_id,
					amountPaise: payment.amountPaise,
					currency: "INR",
				},
				userId
			);
			if (fulfillment.kind !== "success") {
				return c.json({ error: { message: "Payment verification failed" } }, 500);
			}
			return c.json({
				success: true,
				tokens_awarded: fulfillment.tokensGranted,
				new_balance: fulfillment.newBalance,
			} satisfies BillingVerifyResponse);
		}

		const providerPayment = parseCapturedRazorpayPayment(
			await fetchRazorpayPayment(razorpay_payment_id)
		);
		if (
			!providerPayment ||
			providerPayment.paymentId !== razorpay_payment_id ||
			providerPayment.orderId !== razorpay_order_id ||
			providerPayment.amountPaise !== payment.amountPaise
		) {
			return c.json({ error: { message: "Payment details do not match order" } }, 400);
		}

		const fulfillment = await fulfillPayment(providerPayment, userId);

		if (fulfillment.kind === "not-found") {
			return c.json({ error: { message: "Order not found" } }, 404);
		}
		if (fulfillment.kind === "unauthorized") {
			return c.json({ error: { message: "Unauthorized" } }, 403);
		}
		if (fulfillment.kind === "invalid") {
			return c.json({ error: { message: "Payment details do not match order" } }, 400);
		}
		if (fulfillment.kind === "conflict") {
			return c.json({ error: { message: "Payment is already linked differently" } }, 409);
		}

		return c.json({
			success: true,
			tokens_awarded: fulfillment.tokensGranted,
			new_balance: fulfillment.newBalance,
		} satisfies BillingVerifyResponse);
	} catch (error) {
		logSafeError("billing_verification_failed", error);
		return c.json({ error: { message: "Payment verification failed" } }, 500);
	}
});

billing.post("/webhook", webhookBodyLimit, webhookRateLimit, async (c) => {
	try {
		const rawBody = await c.req.text();
		const signature = c.req.header("x-razorpay-signature") ?? "";

		if (!verifyWebhookSignature(rawBody, signature)) {
			return c.json({ error: { message: "Invalid webhook signature" } }, 400);
		}

		let event: unknown;
		try {
			event = JSON.parse(rawBody);
		} catch {
			return c.json({ error: { message: "Invalid webhook payload" } }, 400);
		}

		if (!isRecord(event) || typeof event["event"] !== "string") {
			return c.json({ error: { message: "Invalid webhook payload" } }, 400);
		}

		if (event["event"] !== "payment.captured") {
			return c.json({ status: "ok" });
		}

		const payload = event["payload"];
		const webhookPayment = isRecord(payload) ? payload["payment"] : undefined;
		const paymentEntity = isRecord(webhookPayment) ? webhookPayment["entity"] : undefined;
		const capturedPayment = parseCapturedRazorpayPayment(paymentEntity);

		if (!capturedPayment) {
			return c.json({ error: { message: "Invalid captured payment" } }, 400);
		}

		const fulfillment = await fulfillPayment(capturedPayment);
		if (fulfillment.kind === "not-found") {
			return c.json({ error: { message: "Order not found" } }, 503);
		}
		if (fulfillment.kind === "invalid" || fulfillment.kind === "unauthorized") {
			return c.json({ error: { message: "Payment details do not match order" } }, 400);
		}
		if (fulfillment.kind === "conflict") {
			return c.json({ error: { message: "Payment is already linked differently" } }, 409);
		}

		return c.json({ status: "ok" });
	} catch (error) {
		logSafeError("billing_webhook_failed", error);
		return c.json({ error: { message: "Webhook processing failed" } }, 500);
	}
});

export default billing;
