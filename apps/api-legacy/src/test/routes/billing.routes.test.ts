import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const currentUserId = "user_1";
const createdPayments: unknown[] = [];
const updates: unknown[] = [];

interface PaymentRow {
	userId: string;
	razorpayOrderId: string;
	razorpayPaymentId: string | null;
	amountPaise: number;
	status: string;
	tokensGranted: number;
}

interface Condition {
	conditions?: Array<Condition | undefined>;
	left?: keyof PaymentRow;
	op: "and" | "eq";
	right?: unknown;
}

let selectedPayments: PaymentRow[] = [];
let paymentSignatureValid = true;
let webhookSignatureValid = true;
let balance = 42;
let transactionActive = false;
let providerCalledInsideTransaction = false;

const userRepository = {
	getTokenBalance: mock(),
	findById: mock(),
	addTokens: mock(),
};

const createOrder = mock();
const fetchRazorpayPayment = mock();
const runTransaction = mock();
const getAccountingBalance = mock();

mock.module("../../middleware/rate-limit", () => ({
	clientAddress: () => "127.0.0.1",
	rateLimit: () => async (_c: unknown, next: () => Promise<void>) => await next(),
	userRateLimit: () => async (_c: unknown, next: () => Promise<void>) => await next(),
}));

const paymentsTable = {
	amountPaise: "amountPaise",
	razorpayOrderId: "razorpayOrderId",
	status: "status",
	userId: "userId",
};

function payment(overrides: Partial<PaymentRow> = {}): PaymentRow {
	return {
		userId: currentUserId,
		razorpayOrderId: "order_1",
		razorpayPaymentId: null,
		amountPaise: 1000,
		status: "created",
		tokensGranted: 10,
		...overrides,
	};
}

function capturedEntity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: "pay_1",
		entity: "payment",
		order_id: "order_1",
		amount: 1000,
		currency: "INR",
		status: "captured",
		captured: true,
		...overrides,
	};
}

function matches(row: PaymentRow, condition: Condition | undefined): boolean {
	if (!condition) {
		return true;
	}
	if (condition.op === "and") {
		return condition.conditions?.every((item) => matches(row, item)) ?? true;
	}
	if (!condition.left) {
		return false;
	}
	return row[condition.left] === condition.right;
}

const database = {
	insert: () => ({
		values: (value: unknown) => {
			createdPayments.push(value);
			return Promise.resolve();
		},
	}),
	select: () => ({
		from: () => ({
			where: (condition: Condition) => ({
				limit: (count: number) =>
					Promise.resolve(
						selectedPayments.filter((row) => matches(row, condition)).slice(0, count)
					),
			}),
		}),
	}),
	transaction: runTransaction,
	update: () => ({
		set: (value: Partial<PaymentRow>) => ({
			where: (condition: Condition) => ({
				returning: () => {
					const row = selectedPayments.find((item) => matches(item, condition));
					if (!row) {
						return Promise.resolve([]);
					}

					updates.push(value);
					Object.assign(row, value);
					return Promise.resolve([row]);
				},
			}),
		}),
	}),
};

function parseCapturedRazorpayPayment(entity: unknown) {
	if (
		typeof entity !== "object" ||
		entity === null ||
		!("entity" in entity) ||
		entity.entity !== "payment" ||
		!("id" in entity) ||
		typeof entity.id !== "string" ||
		!("order_id" in entity) ||
		typeof entity.order_id !== "string" ||
		!("amount" in entity) ||
		!Number.isSafeInteger(entity.amount) ||
		!("currency" in entity) ||
		entity.currency !== "INR" ||
		!("status" in entity) ||
		entity.status !== "captured" ||
		!("captured" in entity) ||
		entity.captured !== true
	) {
		return null;
	}

	return {
		paymentId: entity.id,
		orderId: entity.order_id,
		amountPaise: entity.amount as number,
		currency: "INR" as const,
	};
}

mock.module("drizzle-orm", () => ({
	and: (...conditions: Array<Condition | undefined>) => ({ conditions, op: "and" }),
	eq: (left: keyof PaymentRow, right: unknown) => ({ left, right, op: "eq" }),
	gte: (left: unknown, right: unknown) => ({ left, right, op: "gte" }),
	lte: (left: unknown, right: unknown) => ({ left, right, op: "lte" }),
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

mock.module("../../services/generation-point-accounting.service", () => ({
	GenerationPointAccountingService: class {
		getBalance = getAccountingBalance;
	},
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

mock.module("@/database", () => ({
	UserRepository: userRepository,
	payments: paymentsTable,
	db: database,
}));

mock.module("../../services/razorpay.service", () => ({
	createOrder,
	fetchRazorpayPayment,
	parseCapturedRazorpayPayment,
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
		balance = 42;
		transactionActive = false;
		providerCalledInsideTransaction = false;
		createOrder.mockReset();
		fetchRazorpayPayment.mockReset();
		runTransaction.mockReset();
		getAccountingBalance.mockReset();
		userRepository.getTokenBalance.mockReset();
		userRepository.findById.mockReset();
		userRepository.addTokens.mockReset();

		fetchRazorpayPayment.mockImplementation(async () => {
			providerCalledInsideTransaction = transactionActive;
			return capturedEntity();
		});
		runTransaction.mockImplementation(
			async (callback: (transaction: typeof database) => Promise<unknown>) => {
				transactionActive = true;
				try {
					return await callback(database);
				} finally {
					transactionActive = false;
				}
			}
		);
		userRepository.addTokens.mockImplementation(async (_userId: string, tokens: number) => {
			balance += tokens;
			return { slideTokens: balance };
		});
		userRepository.findById.mockImplementation(async () => ({ slideTokens: balance }));
		getAccountingBalance.mockResolvedValue(balance);
	});

	it("returns the current token balance", async () => {
		getAccountingBalance.mockResolvedValue(42.5);

		const response = await app().request("/billing/balance");

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ slide_tokens: 42.5 });
		expect(getAccountingBalance).toHaveBeenCalledWith(currentUserId);
	});

	it("validates checkout packs and custom integer quantity bounds", async () => {
		const invalidPack = await app().request("/billing/checkout", {
			method: "POST",
			body: JSON.stringify({ pack: "unknown" }),
		});
		const invalidCustom = await app().request("/billing/checkout", {
			method: "POST",
			body: JSON.stringify({ pack: "custom", quantity: 5 }),
		});
		const fractionalCustom = await app().request("/billing/checkout", {
			method: "POST",
			body: JSON.stringify({ pack: "custom", quantity: 25.5 }),
		});

		expect(invalidPack.status).toBe(400);
		expect(await json(invalidPack)).toEqual({ error: { message: "Invalid pack" } });
		expect(invalidCustom.status).toBe(400);
		expect(await json(invalidCustom)).toEqual({
			error: { message: "Custom quantity must be 25–2500" },
		});
		expect(fractionalCustom.status).toBe(400);
	});

	it("creates checkout orders and stores pending payment rows", async () => {
		createOrder.mockResolvedValue({
			orderId: "order_1",
			amount: 5000,
			currency: "INR",
			tokens: 25,
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
			tokens: 25,
			keyId: "rzp_key",
		});
		expect(createOrder).toHaveBeenCalledWith(currentUserId, "starter", undefined);
		expect(createdPayments).toEqual([
			{
				userId: currentUserId,
				razorpayOrderId: "order_1",
				amountPaise: 5000,
				tokensGranted: 25,
				status: "created",
			},
		]);
	});

	it("rejects payment verification with missing or invalid signatures", async () => {
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
		expect(fetchRazorpayPayment).not.toHaveBeenCalled();
	});

	it("fetches and validates the provider payment before transactional fulfillment", async () => {
		selectedPayments = [payment()];

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
		expect(fetchRazorpayPayment).toHaveBeenCalledWith("pay_1");
		expect(providerCalledInsideTransaction).toBe(false);
		expect(runTransaction).toHaveBeenCalledTimes(1);
		expect(updates).toEqual([{ razorpayPaymentId: "pay_1", status: "paid" }]);
		expect(userRepository.addTokens).toHaveBeenCalledWith(currentUserId, 10, database);
	});

	it("rejects provider payments that do not match the stored order", async () => {
		selectedPayments = [payment()];
		fetchRazorpayPayment.mockResolvedValue(capturedEntity({ amount: 999 }));

		const response = await app().request("/billing/verify", {
			method: "POST",
			body: JSON.stringify({
				razorpay_order_id: "order_1",
				razorpay_payment_id: "pay_1",
				razorpay_signature: "sig",
			}),
		});

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({
			error: { message: "Payment details do not match order" },
		});
		expect(runTransaction).not.toHaveBeenCalled();
		expect(userRepository.addTokens).not.toHaveBeenCalled();
	});

	it("returns idempotent success without granting twice across verify and webhook races", async () => {
		selectedPayments = [payment()];
		const [verify, webhook] = await Promise.all([
			app().request("/billing/verify", {
				method: "POST",
				body: JSON.stringify({
					razorpay_order_id: "order_1",
					razorpay_payment_id: "pay_1",
					razorpay_signature: "sig",
				}),
			}),
			app().request("/billing/webhook", {
				method: "POST",
				headers: { "x-razorpay-signature": "sig" },
				body: JSON.stringify({
					event: "payment.captured",
					payload: { payment: { entity: capturedEntity() } },
				}),
			}),
		]);

		expect(verify.status).toBe(200);
		expect(webhook.status).toBe(200);
		expect(await json(webhook)).toEqual({ status: "ok" });
		expect(userRepository.addTokens).toHaveBeenCalledTimes(1);
		expect(userRepository.findById).toHaveBeenCalledWith(currentUserId, database);
		expect(updates).toHaveLength(1);
	});

	it("returns missing and unauthorized verify orders before provider calls", async () => {
		const notFound = await app().request("/billing/verify", {
			method: "POST",
			body: JSON.stringify({
				razorpay_order_id: "order_1",
				razorpay_payment_id: "pay_1",
				razorpay_signature: "sig",
			}),
		});

		selectedPayments = [payment({ userId: "other_user" })];
		const unauthorized = await app().request("/billing/verify", {
			method: "POST",
			body: JSON.stringify({
				razorpay_order_id: "order_1",
				razorpay_payment_id: "pay_1",
				razorpay_signature: "sig",
			}),
		});

		expect(notFound.status).toBe(404);
		expect(await json(notFound)).toEqual({ error: { message: "Order not found" } });
		expect(unauthorized.status).toBe(403);
		expect(await json(unauthorized)).toEqual({ error: { message: "Unauthorized" } });
		expect(fetchRazorpayPayment).not.toHaveBeenCalled();
	});

	it("fully validates captured webhook entities", async () => {
		selectedPayments = [payment()];

		const response = await app().request("/billing/webhook", {
			method: "POST",
			headers: { "x-razorpay-signature": "sig" },
			body: JSON.stringify({
				event: "payment.captured",
				payload: {
					payment: { entity: capturedEntity({ captured: false, status: "authorized" }) },
				},
			}),
		});

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({
			error: { message: "Invalid captured payment" },
		});
		expect(runTransaction).not.toHaveBeenCalled();
	});

	it("returns a retriable response for signed webhooks with unknown orders", async () => {
		const response = await app().request("/billing/webhook", {
			method: "POST",
			headers: { "x-razorpay-signature": "sig" },
			body: JSON.stringify({
				event: "payment.captured",
				payload: { payment: { entity: capturedEntity() } },
			}),
		});

		expect(response.status).toBe(503);
		expect(await json(response)).toEqual({ error: { message: "Order not found" } });
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
