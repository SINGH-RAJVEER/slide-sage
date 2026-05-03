import crypto from "node:crypto";
import Razorpay from "razorpay";

export type PackName = "starter" | "pro" | "premium" | "custom";

const PACKS: Record<Exclude<PackName, "custom">, { tokens: number; amountPaise: number }> = {
    starter: { tokens: 10, amountPaise: 5000 },
    pro: { tokens: 100, amountPaise: 45000 },
    premium: { tokens: 250, amountPaise: 100000 },
};

export function resolvePackPrice(pack: PackName, quantity?: number): { tokens: number; amountPaise: number } {
    if (pack !== "custom") {
        return PACKS[pack];
    }

    const tokens = quantity ?? 10;
    let priceRs = tokens * 5;
    if (tokens > 250) priceRs *= 0.8;
    else if (tokens > 100) priceRs *= 0.9;

    return { tokens, amountPaise: Math.round(priceRs * 100) };
}

export function createRazorpayClient(): Razorpay {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set");
    }

    return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export async function createOrder(
    userId: string,
    pack: PackName,
    quantity?: number,
): Promise<{ orderId: string; amount: number; currency: string; tokens: number; keyId: string }> {
    const { tokens, amountPaise } = resolvePackPrice(pack, quantity);
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
        keyId: process.env.RAZORPAY_KEY_ID!,
    };
}

export function verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string,
): boolean {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) throw new Error("RAZORPAY_KEY_SECRET not set");

    const expected = crypto
        .createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

    return expected === signature;
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET not set");

    const expected = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");

    return expected === signature;
}
