import { afterEach, describe, expect, it } from "bun:test";
import crypto from "node:crypto";
import {
    resolvePackPrice,
    verifyPaymentSignature,
    verifyWebhookSignature,
} from "../../services/razorpay.service";

const RAZORPAY_KEY_SECRET = "RAZORPAY_KEY_SECRET";
const RAZORPAY_WEBHOOK_SECRET = "RAZORPAY_WEBHOOK_SECRET";
const testEnv: Record<string, string | undefined> = process.env;
const originalSecret = testEnv[RAZORPAY_KEY_SECRET];
const originalWebhookSecret = testEnv[RAZORPAY_WEBHOOK_SECRET];

function hmac(secret: string, payload: string): string {
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

afterEach(() => {
    testEnv[RAZORPAY_KEY_SECRET] = originalSecret;
    testEnv[RAZORPAY_WEBHOOK_SECRET] = originalWebhookSecret;
});

describe("razorpay service", () => {
    it("resolves fixed pack prices", () => {
        expect(resolvePackPrice("starter")).toEqual({ tokens: 25, amountPaise: 5000 });
        expect(resolvePackPrice("pro")).toEqual({ tokens: 250, amountPaise: 45000 });
        expect(resolvePackPrice("premium")).toEqual({ tokens: 625, amountPaise: 100000 });
    });

    it("resolves custom prices with volume discounts", () => {
        expect(resolvePackPrice("custom", 25)).toEqual({ tokens: 25, amountPaise: 5000 });
        expect(resolvePackPrice("custom", 250)).toEqual({ tokens: 250, amountPaise: 45000 });
        expect(resolvePackPrice("custom", 625)).toEqual({ tokens: 625, amountPaise: 100000 });
    });

    it("verifies checkout signatures with the configured key secret", () => {
        testEnv[RAZORPAY_KEY_SECRET] = "checkout-secret";

        const signature = hmac("checkout-secret", "order_123|pay_456");

        expect(verifyPaymentSignature("order_123", "pay_456", signature)).toBe(true);
        expect(verifyPaymentSignature("order_123", "pay_456", "invalid")).toBe(false);
    });

    it("requires a key secret before verifying checkout signatures", () => {
        delete testEnv[RAZORPAY_KEY_SECRET];

        expect(() => verifyPaymentSignature("order_123", "pay_456", "signature")).toThrow(
            "RAZORPAY_KEY_SECRET not set"
        );
    });

    it("verifies webhook signatures against the raw request body", () => {
        testEnv[RAZORPAY_WEBHOOK_SECRET] = "webhook-secret";
        const rawBody = JSON.stringify({ event: "payment.captured" });
        const signature = hmac("webhook-secret", rawBody);

        expect(verifyWebhookSignature(rawBody, signature)).toBe(true);
        expect(verifyWebhookSignature(`${rawBody}\n`, signature)).toBe(false);
    });
});
