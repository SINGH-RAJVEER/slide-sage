import crypto from "node:crypto";
import type { BillingCheckoutResponse, BillingPackName } from "@slidesage/types";
import Razorpay from "razorpay";

const PACKS: Record<Exclude<BillingPackName, "custom">, { tokens: number; amountPaise: number }> = {
	starter: { tokens: 25, amountPaise: 5000 },
	pro: { tokens: 250, amountPaise: 45000 },
	premium: { tokens: 625, amountPaise: 100000 },
};

export interface CapturedRazorpayPayment {
	paymentId: string;
	orderId: string;
	amountPaise: number;
	currency: "INR";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parsePositiveInteger(value: unknown): number | null {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string" && /^\d+$/.test(value)
				? Number(value)
				: Number.NaN;

	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isZeroInteger(value: unknown): boolean {
	return value === 0 || value === "0";
}

function isStrictHexSignature(signature: string): boolean {
	return /^[a-fA-F0-9]{64}$/.test(signature);
}

function signaturesMatch(expected: Buffer, signature: string): boolean {
	if (!isStrictHexSignature(signature)) {
		return false;
	}

	const actual = Buffer.from(signature, "hex");
	return actual.length === expected.length && crypto.timingSafeEqual(expected, actual);
}

async function withRazorpayTimeout<T>(operation: Promise<T>): Promise<T> {
	const configured = Number.parseInt(process.env["RAZORPAY_REQUEST_TIMEOUT_MS"] ?? "15000", 10);
	const timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : 15000;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	return await Promise.race([
		operation,
		new Promise<never>((_, reject) => {
			timeout = setTimeout(() => reject(new Error("Razorpay request timed out")), timeoutMs);
		}),
	]).finally(() => {
		if (timeout) clearTimeout(timeout);
	});
}

export function resolvePackPrice(
	pack: BillingPackName,
	quantity?: number
): { tokens: number; amountPaise: number } {
	if (pack !== "custom") {
		return PACKS[pack];
	}

	if (!Number.isSafeInteger(quantity) || (quantity ?? 0) < 25 || (quantity ?? 0) > 2500) {
		throw new Error("Custom quantity must be an integer between 25 and 2500");
	}

	const tokens = quantity as number;
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
	const receipt = `rcpt_${crypto.randomUUID().replaceAll("-", "")}`;

	const order = await withRazorpayTimeout(
		rzp.orders.create({
			amount: amountPaise,
			currency: "INR",
			receipt,
			notes: { userId, pack, tokens: String(tokens) },
			partial_payment: false,
		})
	);

	if (
		typeof order.id !== "string" ||
		order.id.length === 0 ||
		order.entity !== "order" ||
		parsePositiveInteger(order.amount) !== amountPaise ||
		parsePositiveInteger(order.amount_due) !== amountPaise ||
		!isZeroInteger(order.amount_paid) ||
		order.currency !== "INR" ||
		order.receipt !== receipt ||
		order.status !== "created" ||
		order.partial_payment !== false
	) {
		throw new Error("Razorpay returned an invalid order");
	}

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

	const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest();

	return signaturesMatch(expected, signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
	const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
	if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET not set");

	const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();

	return signaturesMatch(expected, signature);
}

export async function fetchRazorpayPayment(paymentId: string): Promise<unknown> {
	if (typeof paymentId !== "string" || paymentId.length === 0) {
		throw new Error("Razorpay payment ID must be set");
	}

	return await withRazorpayTimeout(createRazorpayClient().payments.fetch(paymentId));
}

export function parseCapturedRazorpayPayment(entity: unknown): CapturedRazorpayPayment | null {
	if (
		!isRecord(entity) ||
		entity["entity"] !== "payment" ||
		typeof entity["id"] !== "string" ||
		entity["id"].length === 0 ||
		typeof entity["order_id"] !== "string" ||
		entity["order_id"].length === 0 ||
		entity["currency"] !== "INR" ||
		entity["status"] !== "captured" ||
		entity["captured"] !== true
	) {
		return null;
	}

	const amountPaise = parsePositiveInteger(entity["amount"]);
	if (amountPaise === null) {
		return null;
	}

	return {
		paymentId: entity["id"],
		orderId: entity["order_id"],
		amountPaise,
		currency: "INR",
	};
}
