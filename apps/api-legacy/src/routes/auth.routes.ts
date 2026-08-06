import { and, eq, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { accounts, type Database, db, runWithDatabase, users, verifications } from "@/database";
import { clientAddress, rateLimit, requestEmail } from "../middleware/rate-limit";
import {
	consumeOTPDeliveryFailure,
	createAuth,
	type Env,
	hashAuthPassword,
	isLegacyPasswordHash,
	runWithOTPDeliveryRequest,
	verifyAuthPassword,
} from "../services/auth";
import { logSafeError } from "../utils/safe-logging";

const authRoutes = new Hono();
const authBodyLimit = bodyLimit({
	maxSize: 32 * 1024,
	onError: (c) => c.json({ error: { message: "Request body is too large" } }, 413),
});

const otpRateLimit = rateLimit([
	{
		scope: "auth:otp:email",
		limit: 5,
		windowSeconds: 60 * 60,
		identity: requestEmail,
	},
	{
		scope: "auth:otp:ip",
		limit: 20,
		windowSeconds: 60 * 60,
		identity: clientAddress,
	},
]);
const signInRateLimit = rateLimit([
	{
		scope: "auth:sign-in:email",
		limit: 10,
		windowSeconds: 15 * 60,
		identity: requestEmail,
	},
	{
		scope: "auth:sign-in:ip",
		limit: 30,
		windowSeconds: 15 * 60,
		identity: clientAddress,
	},
]);
const signUpRateLimit = rateLimit([
	{
		scope: "auth:sign-up:email",
		limit: 5,
		windowSeconds: 60 * 60,
		identity: requestEmail,
	},
	{
		scope: "auth:sign-up:ip",
		limit: 20,
		windowSeconds: 60 * 60,
		identity: clientAddress,
	},
]);

authRoutes.use("*", authBodyLimit);
authRoutes.use("/email-otp/*", otpRateLimit);
authRoutes.use("/sign-in/*", signInRateLimit);
authRoutes.use("/sign-up/*", signUpRateLimit);

function getAuthEnv(env: unknown): Env {
	return (env ?? {}) as Env;
}

type EmailOTPType = "email-verification" | "sign-in" | "forget-password";

function isEmailOTPType(value: unknown): value is EmailOTPType {
	return value === "email-verification" || value === "sign-in" || value === "forget-password";
}

type VerificationId = Pick<typeof verifications.$inferSelect, "id">;

function normalizeEmail(value: unknown): string {
	return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function asObject(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function replaceJsonBody(request: Request, body: Record<string, unknown>): Request {
	const headers = new Headers(request.headers);
	headers.set("Content-Type", "application/json");
	headers.delete("Content-Length");
	return new Request(request.url, {
		method: request.method,
		headers,
		body: JSON.stringify(body),
		redirect: request.redirect,
		signal: request.signal,
	});
}

async function getVerificationIds(identifier: string): Promise<VerificationId[]> {
	return db
		.select({ id: verifications.id })
		.from(verifications)
		.where(eq(verifications.identifier, identifier));
}

async function deleteVerificationIds(ids: string[]): Promise<void> {
	await Promise.all(ids.map((id) => db.delete(verifications).where(eq(verifications.id, id))));
}

async function finalizeOTPReplacement(
	identifier: string,
	previous: VerificationId[],
	succeeded: boolean
): Promise<void> {
	if (succeeded) {
		await deleteVerificationIds(previous.map(({ id }) => id));
		return;
	}

	const previousIds = new Set(previous.map(({ id }) => id));
	const current = await getVerificationIds(identifier);
	await deleteVerificationIds(current.filter(({ id }) => !previousIds.has(id)).map(({ id }) => id));
}

async function proxyOTPRequest(
	c: Context,
	body: Record<string, unknown>,
	identifier: string | null
): Promise<Response> {
	const request = replaceJsonBody(c.req.raw, body);
	const processRequest = async (): Promise<Response> => {
		const previous = identifier ? await getVerificationIds(identifier) : [];
		let response: Response;

		try {
			response = await runWithOTPDeliveryRequest(request, () =>
				createAuth(getAuthEnv(c.env)).handler(request)
			);
		} catch (error) {
			consumeOTPDeliveryFailure(request);
			if (identifier) {
				await finalizeOTPReplacement(identifier, previous, false);
			}
			throw error;
		}

		const deliveryFailed = consumeOTPDeliveryFailure(request);
		if (identifier) {
			await finalizeOTPReplacement(identifier, previous, response.ok && !deliveryFailed);
		}

		if (deliveryFailed) {
			return c.json({ error: { message: "Email delivery is temporarily unavailable" } }, 503);
		}

		return response;
	};

	if (!identifier) return await processRequest();

	return await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))`);
		return await runWithDatabase(tx as unknown as Database, processRequest);
	});
}

authRoutes.post("/email-otp/send-verification-otp", async (c) => {
	const body = asObject(
		await c.req.raw
			.clone()
			.json()
			.catch(() => ({}))
	);
	const email = normalizeEmail(body["email"]);
	const type = isEmailOTPType(body["type"]) ? body["type"] : null;
	const normalizedBody = typeof body["email"] === "string" ? { ...body, email } : body;
	const identifier = email && type ? `${type}-otp-${email}` : null;

	return proxyOTPRequest(c, normalizedBody, identifier);
});

authRoutes.post("/email-otp/request-password-reset", async (c) => {
	const body = asObject(
		await c.req.raw
			.clone()
			.json()
			.catch(() => ({}))
	);
	const email = normalizeEmail(body["email"]);
	const normalizedBody = typeof body["email"] === "string" ? { ...body, email } : body;
	const identifier = email ? `forget-password-otp-${email}` : null;

	return proxyOTPRequest(c, normalizedBody, identifier);
});

authRoutes.post("/email-otp/reset-password", async (c) => {
	const body = asObject(
		await c.req.raw
			.clone()
			.json()
			.catch(() => ({}))
	);
	const email = normalizeEmail(body["email"]);
	const normalizedBody = typeof body["email"] === "string" ? { ...body, email } : body;

	return createAuth(getAuthEnv(c.env)).handler(replaceJsonBody(c.req.raw, normalizedBody));
});

authRoutes.post("/change-password", async (c) => {
	const body = asObject(
		await c.req.raw
			.clone()
			.json()
			.catch(() => ({}))
	);
	return createAuth(getAuthEnv(c.env)).handler(
		replaceJsonBody(c.req.raw, { ...body, revokeOtherSessions: true })
	);
});

authRoutes.post("/forget-password/email-otp", (c) =>
	c.json({ error: { message: "Resource not found" } }, 404)
);

authRoutes.post("/update-user", (c) =>
	c.json({ error: { message: "Use the profile API to update account details" } }, 403)
);

// Compatibility shim for legacy accounts created before provider/password format fix.
authRoutes.post("/sign-in/email", async (c) => {
	const parsedRequest = c.req.raw.clone();
	const body = asObject(await parsedRequest.json().catch(() => ({})));
	const email = normalizeEmail(body["email"]);
	const password = typeof body["password"] === "string" ? body["password"] : "";

	if (!email || !password) {
		return createAuth(getAuthEnv(c.env)).handler(c.req.raw);
	}

	const request = replaceJsonBody(c.req.raw, { ...body, email });

	let legacyCredential: { id: string; password: string } | undefined;
	try {
		const user = await db.query.users.findFirst({
			where: eq(users.email, email),
		});

		if (user) {
			const credentialAccount = await db.query.accounts.findFirst({
				where: and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")),
			});

			if (credentialAccount?.password && isLegacyPasswordHash(credentialAccount.password)) {
				legacyCredential = {
					id: credentialAccount.id,
					password: credentialAccount.password,
				};
			} else if (!credentialAccount) {
				const legacyAccount = await db.query.accounts.findFirst({
					where: and(eq(accounts.userId, user.id), eq(accounts.providerId, "email")),
				});

				if (
					legacyAccount?.password &&
					isLegacyPasswordHash(legacyAccount.password) &&
					(await verifyAuthPassword({ hash: legacyAccount.password, password }))
				) {
					await db
						.update(accounts)
						.set({
							providerId: "credential",
							accountId: user.id,
							password: await hashAuthPassword(password),
						})
						.where(
							and(
								eq(accounts.id, legacyAccount.id),
								eq(accounts.providerId, "email"),
								eq(accounts.password, legacyAccount.password)
							)
						);
				}
			}
		}
	} catch (err) {
		logSafeError("legacy_auth_migration_failed", err);
	}

	const response = await createAuth(getAuthEnv(c.env)).handler(request);
	if (response.ok && legacyCredential) {
		try {
			await db
				.update(accounts)
				.set({ password: await hashAuthPassword(password) })
				.where(
					and(
						eq(accounts.id, legacyCredential.id),
						eq(accounts.providerId, "credential"),
						eq(accounts.password, legacyCredential.password)
					)
				);
		} catch (error) {
			logSafeError("legacy_auth_hash_upgrade_failed", error);
		}
	}
	return response;
});

// All other auth routes handled by better-auth
authRoutes.all("/*", (c) => createAuth(getAuthEnv(c.env)).handler(c.req.raw));

export default authRoutes;
