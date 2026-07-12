import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const currentUserId = "user_1";
const createdPayments: unknown[] = [];
const updates: unknown[] = [];
let selectedPayments: Array<{
    userId: string;
    status: string;
    tokensGranted: number;
}> = [];
let paymentSignatureValid = true;
let webhookSignatureValid = true;

const userRepository = {
    getTokenBalance: mock(),
    findById: mock(),
    addTokens: mock(),
};

const createOrder = mock();

mock.module("drizzle-orm", () => ({
    eq: (left: unknown, right: unknown) => ({ left, right, op: "eq" }),
}));

mock.module("../../services/auth", () => ({
    authMiddleware: async (
        c: { set: (key: string, value: string) => void },
        next: () => Promise<void>
    ) => {
        c.set("userId", currentUserId);
        await next();
    },
    getCurrentUserId: () => currentUserId,
}));

mock.module("@slide-sage/database", () => ({
    UserRepository: userRepository,
    payments: {
        razorpayOrderId: "razorpayOrderId",
    },
    db: {
        insert: () => ({
            values: (value: unknown) => {
                createdPayments.push(value);
                return Promise.resolve();
            },
        }),
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: () => Promise.resolve(selectedPayments),
                }),
            }),
        }),
        update: () => ({
            set: (value: unknown) => {
                updates.push(value);
                return {
                    where: () => Promise.resolve(),
                };
            },
        }),
    },
}));

mock.module("../../services/razorpay.service", () => ({
    createOrder,
    resolvePackPrice: (pack: string, quantity?: number) => {
        if (pack === "starter") return { tokens: 10, amountPaise: 5000 };
        if (pack === "pro") return { tokens: 100, amountPaise: 45000 };
        if (pack === "premium") return { tokens: 250, amountPaise: 100000 };
        return { tokens: quantity ?? 10, amountPaise: (quantity ?? 10) * 500 };
    },
    verifyPaymentSignature: () => paymentSignatureValid,
    verifyWebhookSignature: () => webhookSignatureValid,
}));

const billingRoutes = (await import("../../routes/billing.routes")).default;

function app() {
    const hono = new Hono();
    hono.route("/billing", billingRoutes);
    return hono;
}

async function json(response: Response) {
    return await response.json();
}

describe("billing routes", () => {
    beforeEach(() => {
        createdPayments.length = 0;
        updates.length = 0;
        selectedPayments = [];
        paymentSignatureValid = true;
        webhookSignatureValid = true;
        createOrder.mockReset();
        userRepository.getTokenBalance.mockReset();
        userRepository.findById.mockReset();
        userRepository.addTokens.mockReset();
    });

    it("returns the current token balance", async () => {
        userRepository.getTokenBalance.mockResolvedValue({ user: { slideTokens: 42.5 } });

        const response = await app().request("/billing/balance");

        expect(response.status).toBe(200);
        expect(await json(response)).toEqual({ slide_tokens: 42.5 });
        expect(userRepository.getTokenBalance).toHaveBeenCalledWith(currentUserId);
    });

    it("validates checkout packs and custom quantity bounds", async () => {
        const invalidPack = await app().request("/billing/checkout", {
            method: "POST",
            body: JSON.stringify({ pack: "unknown" }),
        });
        const invalidCustom = await app().request("/billing/checkout", {
            method: "POST",
            body: JSON.stringify({ pack: "custom", quantity: 5 }),
        });

        expect(invalidPack.status).toBe(400);
        expect(await json(invalidPack)).toEqual({ error: { message: "Invalid pack" } });
        expect(invalidCustom.status).toBe(400);
        expect(await json(invalidCustom)).toEqual({
            error: { message: "Custom quantity must be 10–1000" },
        });
    });

    it("creates checkout orders and stores pending payment rows", async () => {
        createOrder.mockResolvedValue({
            orderId: "order_1",
            amount: 5000,
            currency: "INR",
            tokens: 10,
            keyId: "rzp_key",
        });

        const response = await app().request("/billing/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pack: "starter" }),
        });

        expect(response.status).toBe(200);
        expect(await json(response)).toEqual({
            orderId: "order_1",
            amount: 5000,
            currency: "INR",
            tokens: 10,
            keyId: "rzp_key",
        });
        expect(createOrder).toHaveBeenCalledWith(currentUserId, "starter", undefined);
        expect(createdPayments).toEqual([
            {
                userId: currentUserId,
                razorpayOrderId: "order_1",
                amountPaise: 5000,
                tokensGranted: 10,
                status: "created",
            },
        ]);
    });

    it("rejects payment verification with missing or invalid details", async () => {
        const missing = await app().request("/billing/verify", {
            method: "POST",
            body: JSON.stringify({}),
        });
        paymentSignatureValid = false;
        const invalidSignature = await app().request("/billing/verify", {
            method: "POST",
            body: JSON.stringify({
                razorpay_order_id: "order_1",
                razorpay_payment_id: "pay_1",
                razorpay_signature: "bad",
            }),
        });

        expect(missing.status).toBe(400);
        expect(await json(missing)).toEqual({ error: { message: "Missing payment details" } });
        expect(invalidSignature.status).toBe(400);
        expect(await json(invalidSignature)).toEqual({
            error: { message: "Invalid payment signature" },
        });
    });

    it("verifies unpaid payments once and awards tokens", async () => {
        selectedPayments = [{ userId: currentUserId, status: "created", tokensGranted: 10 }];
        userRepository.addTokens.mockResolvedValue({ slideTokens: 52 });

        const response = await app().request("/billing/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                razorpay_order_id: "order_1",
                razorpay_payment_id: "pay_1",
                razorpay_signature: "sig",
            }),
        });

        expect(response.status).toBe(200);
        expect(await json(response)).toEqual({
            success: true,
            tokens_awarded: 10,
            new_balance: 52,
        });
        expect(updates).toEqual([{ razorpayPaymentId: "pay_1", status: "paid" }]);
        expect(userRepository.addTokens).toHaveBeenCalledWith(currentUserId, 10);
    });

    it("returns idempotent success for already paid payments", async () => {
        selectedPayments = [{ userId: currentUserId, status: "paid", tokensGranted: 10 }];
        userRepository.findById.mockResolvedValue({ slideTokens: 60 });

        const response = await app().request("/billing/verify", {
            method: "POST",
            body: JSON.stringify({
                razorpay_order_id: "order_1",
                razorpay_payment_id: "pay_1",
                razorpay_signature: "sig",
            }),
        });

        expect(response.status).toBe(200);
        expect(await json(response)).toEqual({
            success: true,
            tokens_awarded: 10,
            new_balance: 60,
        });
        expect(userRepository.addTokens).not.toHaveBeenCalled();
    });

    it("handles missing, unauthorized, and captured webhook payment states", async () => {
        selectedPayments = [];
        const notFound = await app().request("/billing/verify", {
            method: "POST",
            body: JSON.stringify({
                razorpay_order_id: "order_1",
                razorpay_payment_id: "pay_1",
                razorpay_signature: "sig",
            }),
        });

        selectedPayments = [{ userId: "other_user", status: "created", tokensGranted: 10 }];
        const unauthorized = await app().request("/billing/verify", {
            method: "POST",
            body: JSON.stringify({
                razorpay_order_id: "order_1",
                razorpay_payment_id: "pay_1",
                razorpay_signature: "sig",
            }),
        });

        selectedPayments = [{ userId: currentUserId, status: "created", tokensGranted: 10 }];
        userRepository.addTokens.mockResolvedValue({ slideTokens: 52 });
        const webhook = await app().request("/billing/webhook", {
            method: "POST",
            headers: { "x-razorpay-signature": "sig" },
            body: JSON.stringify({
                event: "payment.captured",
                payload: { payment: { entity: { order_id: "order_1", id: "pay_1" } } },
            }),
        });

        expect(notFound.status).toBe(404);
        expect(await json(notFound)).toEqual({ error: { message: "Order not found" } });
        expect(unauthorized.status).toBe(403);
        expect(await json(unauthorized)).toEqual({ error: { message: "Unauthorized" } });
        expect(webhook.status).toBe(200);
        expect(await json(webhook)).toEqual({ status: "ok" });
        expect(userRepository.addTokens).toHaveBeenCalledWith(currentUserId, 10);
    });

    it("rejects webhooks with invalid signatures", async () => {
        webhookSignatureValid = false;

        const response = await app().request("/billing/webhook", {
            method: "POST",
            headers: { "x-razorpay-signature": "bad" },
            body: "{}",
        });

        expect(response.status).toBe(400);
        expect(await json(response)).toEqual({ error: { message: "Invalid webhook signature" } });
    });
});
