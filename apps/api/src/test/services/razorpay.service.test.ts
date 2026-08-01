import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import crypto from "node:crypto";

const ordersCreate = mock();
const paymentsFetch = mock();

class MockRazorpay {
    orders = { create: ordersCreate };
    payments = { fetch: paymentsFetch };
}

mock.module("razorpay", () => ({
    default: MockRazorpay,
}));

const {
    createOrder,
    fetchRazorpayPayment,
    parseCapturedRazorpayPayment,
    resolvePackPrice,
    verifyPaymentSignature,
    verifyWebhookSignature,
} = await import("../../services/razorpay.service");

const RAZORPAY_KEY_ID = "RAZORPAY_KEY_ID";
const RAZORPAY_KEY_SECRET = "RAZORPAY_KEY_SECRET";
const RAZORPAY_WEBHOOK_SECRET = "RAZORPAY_WEBHOOK_SECRET";
const testEnv: Record<string, string | undefined> = process.env;
const originalKeyId = testEnv[RAZORPAY_KEY_ID];
const originalSecret = testEnv[RAZORPAY_KEY_SECRET];
const originalWebhookSecret = testEnv[RAZORPAY_WEBHOOK_SECRET];

function hmac(secret: string, payload: string): string {
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

beforeEach(() => {
    ordersCreate.mockReset();
    paymentsFetch.mockReset();
});

afterEach(() => {
    testEnv[RAZORPAY_KEY_ID] = originalKeyId;
    testEnv[RAZORPAY_KEY_SECRET] = originalSecret;
    testEnv[RAZORPAY_WEBHOOK_SECRET] = originalWebhookSecret;
});

describe("razorpay service", () => {
    it("resolves fixed pack prices", () => {
        expect(resolvePackPrice("starter")).toEqual({ tokens: 25, amountPaise: 5000 });
        expect(resolvePackPrice("pro")).toEqual({ tokens: 250, amountPaise: 45000 });
        expect(resolvePackPrice("premium")).toEqual({ tokens: 625, amountPaise: 100000 });
    });

    it("resolves only bounded integer custom quantities", () => {
        expect(resolvePackPrice("custom", 25)).toEqual({ tokens: 25, amountPaise: 5000 });
        expect(resolvePackPrice("custom", 250)).toEqual({ tokens: 250, amountPaise: 45000 });
        expect(resolvePackPrice("custom", 625)).toEqual({ tokens: 625, amountPaise: 100000 });

        expect(() => resolvePackPrice("custom", 25.5)).toThrow("integer between 25 and 2500");
        expect(() => resolvePackPrice("custom", Number.POSITIVE_INFINITY)).toThrow(
            "integer between 25 and 2500"
        );
        expect(() => resolvePackPrice("custom")).toThrow("integer between 25 and 2500");
    });

    it("creates orders with collision-resistant receipts and no partial payments", async () => {
        testEnv[RAZORPAY_KEY_ID] = "rzp_key";
        testEnv[RAZORPAY_KEY_SECRET] = "checkout-secret";
        ordersCreate.mockImplementation(
            async (request: {
                amount: number;
                currency: string;
                receipt: string;
                partial_payment: boolean;
            }) => ({
                ...request,
                id: "order_123",
                entity: "order",
                amount_due: request.amount,
                amount_paid: 0,
                status: "created",
            })
        );

        const order = await createOrder("user_123", "starter");

        expect(order).toEqual({
            orderId: "order_123",
            amount: 5000,
            currency: "INR",
            tokens: 25,
            keyId: "rzp_key",
        });
        const request = ordersCreate.mock.calls[0]?.[0] as {
            receipt: string;
            partial_payment: boolean;
        };
        expect(request.receipt).toMatch(/^rcpt_[a-f0-9]{32}$/);
        expect(request.partial_payment).toBe(false);
    });

    it("rejects inconsistent create-order responses", async () => {
        testEnv[RAZORPAY_KEY_ID] = "rzp_key";
        testEnv[RAZORPAY_KEY_SECRET] = "checkout-secret";
        ordersCreate.mockImplementation(async (request: { receipt: string }) => ({
            id: "order_123",
            entity: "order",
            amount: 4999,
            amount_due: 4999,
            amount_paid: 0,
            currency: "INR",
            receipt: request.receipt,
            status: "created",
            partial_payment: false,
        }));

        expect(createOrder("user_123", "starter")).rejects.toThrow(
            "Razorpay returned an invalid order"
        );
    });

    it("fetches payments through the configured Razorpay client", async () => {
        testEnv[RAZORPAY_KEY_ID] = "rzp_key";
        testEnv[RAZORPAY_KEY_SECRET] = "checkout-secret";
        paymentsFetch.mockResolvedValue({ id: "pay_123" });

        expect(await fetchRazorpayPayment("pay_123")).toEqual({ id: "pay_123" });
        expect(paymentsFetch).toHaveBeenCalledWith("pay_123");
    });

    it("parses only complete INR captured payment entities", () => {
        const captured = {
            id: "pay_123",
            entity: "payment",
            order_id: "order_123",
            amount: 5000,
            currency: "INR",
            status: "captured",
            captured: true,
        };

        expect(parseCapturedRazorpayPayment(captured)).toEqual({
            paymentId: "pay_123",
            orderId: "order_123",
            amountPaise: 5000,
            currency: "INR",
        });
        expect(parseCapturedRazorpayPayment({ ...captured, amount: Number.NaN })).toBeNull();
        expect(parseCapturedRazorpayPayment({ ...captured, currency: "USD" })).toBeNull();
        expect(parseCapturedRazorpayPayment({ ...captured, status: "authorized" })).toBeNull();
        expect(parseCapturedRazorpayPayment({ ...captured, captured: false })).toBeNull();
        expect(parseCapturedRazorpayPayment({ ...captured, order_id: null })).toBeNull();
    });

    it("verifies checkout signatures with strict hexadecimal input", () => {
        testEnv[RAZORPAY_KEY_SECRET] = "checkout-secret";
        const signature = hmac("checkout-secret", "order_123|pay_456");

        expect(verifyPaymentSignature("order_123", "pay_456", signature)).toBe(true);
        expect(verifyPaymentSignature("order_123", "pay_456", signature.toUpperCase())).toBe(true);
        expect(verifyPaymentSignature("order_123", "pay_456", "f".repeat(63))).toBe(false);
        expect(verifyPaymentSignature("order_123", "pay_456", "z".repeat(64))).toBe(false);
    });

    it("requires a key secret before verifying checkout signatures", () => {
        delete testEnv[RAZORPAY_KEY_SECRET];

        expect(() => verifyPaymentSignature("order_123", "pay_456", "f".repeat(64))).toThrow(
            "RAZORPAY_KEY_SECRET not set"
        );
    });

    it("verifies webhook signatures against the exact raw request body", () => {
        testEnv[RAZORPAY_WEBHOOK_SECRET] = "webhook-secret";
        const rawBody = JSON.stringify({ event: "payment.captured" });
        const signature = hmac("webhook-secret", rawBody);

        expect(verifyWebhookSignature(rawBody, signature)).toBe(true);
        expect(verifyWebhookSignature(`${rawBody}\n`, signature)).toBe(false);
        expect(verifyWebhookSignature(rawBody, "not-hex")).toBe(false);
    });
});
