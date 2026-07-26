import crypto from "node:crypto";
import type { BillingCheckoutResponse, BillingPackName } from "@slide-sage/types";
import Razorpay from "razorpay";

const PACKS: Record<Exclude<BillingPackName, "custom">, { tokens: number; amountPaise: number }> = {
    starter: { tokens: 25, amountPaise: 5000 },
    pro: { tokens: 250, amountPaise: 45000 },
    premium: { tokens: 625, amountPaise: 100000 },
};

export function resolvePackPrice(
    pack: BillingPackName,
    quantity?: number
): { tokens: number; amountPaise: number } {
    if (pack !== "custom") {
        return PACKS[pack];
    }

    const tokens = quantity ?? 25;
    let priceRs = tokens * 2;
    if (tokens >= 625) priceRs *= 0.8;
    else if (tokens >= 250) priceRs *= 0.9;

    return { tokens, amountPaise: Math.round(priceRs * 100) };
}

export function createRazorpayClient(): Razorpay {
    const keyId = process.env["RAZORPAY_KEY_ID"];
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];

    if (!keyId || !keySecret) {
        throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set");
    }

    return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export async function createOrder(
    userId: string,
    pack: BillingPackName,
    quantity?: number
): Promise<BillingCheckoutResponse> {
    const { tokens, amountPaise } = resolvePackPrice(pack, quantity);
    const keyId = process.env["RAZORPAY_KEY_ID"];
    if (!keyId) {
        throw new Error("RAZORPAY_KEY_ID must be set");
    }
    const rzp = createRazorpayClient();

    const order = await rzp.orders.create({
        amount: amountPaise,
        currency: "INR",
        receipt: `rcpt_${userId.slice(0, 8)}_${Date.now()}`,
        notes: { userId, pack, tokens: String(tokens) },
    });

    return {
        orderId: order.id,
        amount: amountPaise,
        currency: "INR",
        tokens,
        keyId,
    };
}

export function verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string
): boolean {
    const secret = process.env["RAZORPAY_KEY_SECRET"];
    if (!secret) throw new Error("RAZORPAY_KEY_SECRET not set");

    const expected = crypto
        .createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

    return expected === signature;
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
    if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET not set");

    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    return expected === signature;
}
