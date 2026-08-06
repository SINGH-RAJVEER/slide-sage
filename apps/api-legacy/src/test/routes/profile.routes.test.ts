import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const currentUserId = "user_1";
const changePassword = mock();
const verifyPassword = mock();
const sendOTPEmail = mock();
const findDatabaseUser = mock();
const insertedVerifications: unknown[] = [];
let selectedVerifications: unknown[] = [];
let previousVerifications: { id: string }[] = [];

const profileService = {
	getUserProfile: mock(),
	completeEmailChange: mock(),
	updateUserAvatar: mock(),
	updateUserProfile: mock(),
};

mock.module("../../services/auth", () => ({
	authMiddleware: async (
		c: { set: (key: string, value: string) => void },
		next: () => Promise<void>
	) => {
		c.set("userId", currentUserId);
		await next();
	},
	createAuth: () => ({
		api: {
			changePassword,
			verifyPassword,
		},
	}),
	getCurrentUserId: () => currentUserId,
	sendOTPEmail,
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ conditions }),
	desc: (value: unknown) => value,
	eq: (left: unknown, right: unknown) => ({ left, right }),
	inArray: (left: unknown, values: unknown[]) => ({ left, values }),
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

const transactionDatabase = {
	delete: () => ({ where: () => Promise.resolve() }),
	execute: () => Promise.resolve(),
	insert: () => ({
		values: (value: unknown) => {
			insertedVerifications.push(value);
			return Promise.resolve();
		},
	}),
	select: () => ({
		from: () => ({
			where: () => Promise.resolve(previousVerifications),
		}),
	}),
};

mock.module("@/database", () => ({
	users: { id: "userId", email: "email" },
	verifications: {
		id: "verificationId",
		identifier: "identifier",
		createdAt: "createdAt",
	},
	db: {
		query: { users: { findFirst: findDatabaseUser } },
		transaction: async (callback: (tx: typeof transactionDatabase) => unknown) =>
			await callback(transactionDatabase),
		delete: transactionDatabase.delete,
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: () => ({ limit: () => Promise.resolve(selectedVerifications) }),
				}),
			}),
		}),
	},
}));

mock.module("../../middleware/rate-limit", () => ({
	userRateLimit: () => async (_c: unknown, next: () => Promise<void>) => await next(),
}));

mock.module("../../services/profile.service", () => profileService);

const profileRoutes = (await import("../../routes/profile.routes")).default;

function app() {
	const hono = new Hono();
	hono.route("/profile", profileRoutes);
	return hono;
}

async function json(response: Response) {
	return await response.json();
}

describe("profile routes", () => {
	beforeEach(() => {
		profileService.getUserProfile.mockReset();
		profileService.completeEmailChange.mockReset();
		profileService.updateUserAvatar.mockReset();
		profileService.updateUserProfile.mockReset();
		changePassword.mockReset();
		verifyPassword.mockReset();
		sendOTPEmail.mockReset();
		findDatabaseUser.mockReset();
		insertedVerifications.length = 0;
		selectedVerifications = [];
		previousVerifications = [];
	});

	it("returns the current user's profile", async () => {
		const user = { id: currentUserId, email: "user@example.com" };
		profileService.getUserProfile.mockResolvedValue({ success: true, user });

		const response = await app().request("/profile");

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ user });
		expect(profileService.getUserProfile).toHaveBeenCalledWith(currentUserId);
	});

	it("returns service errors for profile reads", async () => {
		profileService.getUserProfile.mockResolvedValue({
			success: false,
			error: "User not found",
		});

		const response = await app().request("/profile");

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({ error: { message: "User not found" } });
	});

	it("validates and applies profile updates", async () => {
		const empty = await app().request("/profile", {
			method: "PUT",
			body: JSON.stringify({}),
		});
		const user = { id: currentUserId, name: "New Name" };
		profileService.updateUserProfile.mockResolvedValue({ success: true, user });
		const updated = await app().request("/profile", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "New Name" }),
		});

		expect(empty.status).toBe(400);
		expect(await json(empty)).toEqual({ error: { message: "Nothing to update" } });
		expect(updated.status).toBe(200);
		expect(await json(updated)).toEqual({ user });
		expect(profileService.updateUserProfile).toHaveBeenCalledWith(currentUserId, {
			name: "New Name",
		});
	});

	it("delegates password-only updates to Better Auth", async () => {
		changePassword.mockResolvedValue(
			new Response(JSON.stringify({ user: { id: currentUserId } }), {
				status: 200,
				headers: { "Set-Cookie": "session=new" },
			})
		);

		const response = await app().request("/profile", {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				Cookie: "session=old",
			},
			body: JSON.stringify({
				currentPassword: "old-password",
				newPassword: "new-password",
			}),
		});

		expect(response.status).toBe(200);
		expect(changePassword).toHaveBeenCalledWith({
			headers: expect.any(Headers),
			body: {
				currentPassword: "old-password",
				newPassword: "new-password",
				revokeOtherSessions: true,
			},
			asResponse: true,
		});
		expect(profileService.updateUserProfile).not.toHaveBeenCalled();
	});

	it("rejects mixed password and profile updates", async () => {
		const response = await app().request("/profile", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "New Name",
				currentPassword: "old-password",
				newPassword: "new-password",
			}),
		});

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({
			error: { message: "Password changes cannot be combined with profile updates" },
		});
		expect(changePassword).not.toHaveBeenCalled();
		expect(profileService.updateUserProfile).not.toHaveBeenCalled();
	});

	it("requires and verifies the current password before changing email", async () => {
		const missingPassword = await app().request("/profile", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "new@example.com" }),
		});
		expect(missingPassword.status).toBe(400);
		expect(await json(missingPassword)).toEqual({
			error: { message: "Current password is required to change email" },
		});

		verifyPassword.mockResolvedValue({ status: true });
		findDatabaseUser.mockResolvedValueOnce(null);
		findDatabaseUser.mockResolvedValueOnce({
			id: currentUserId,
			email: "old@example.com",
			name: "Test User",
		});
		const user = { id: currentUserId, email: "old@example.com", emailVerified: true };
		profileService.getUserProfile.mockResolvedValue({ success: true, user });
		sendOTPEmail.mockResolvedValue(undefined);
		const response = await app().request("/profile", {
			method: "PUT",
			headers: { "Content-Type": "application/json", Cookie: "session=current" },
			body: JSON.stringify({
				email: "new@example.com",
				currentPassword: "current-password",
			}),
		});

		expect(response.status).toBe(200);
		expect(verifyPassword).toHaveBeenCalledWith({
			headers: expect.any(Headers),
			body: { password: "current-password" },
		});
		expect(await json(response.clone())).toEqual({
			user,
			pending_email: "new@example.com",
			verification_required: true,
		});
		expect(sendOTPEmail).toHaveBeenCalledWith(
			expect.any(Object),
			"new@example.com",
			expect.stringMatching(/^\d{6}$/),
			"email-verification",
			"Test User"
		);
	});

	it("completes an email change with a valid user-bound code", async () => {
		const email = "new@example.com";
		const otp = "123456";
		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(process.env["AUTH_SECRET"] ?? "slidesage-local-development-secret"),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"]
		);
		const digest = await crypto.subtle.sign(
			"HMAC",
			key,
			new TextEncoder().encode(`${currentUserId}\0${email}\0${otp}`)
		);
		const value = Array.from(new Uint8Array(digest))
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("");
		selectedVerifications = [
			{
				id: "verification_1",
				value,
				expiresAt: new Date(Date.now() + 60_000),
			},
		];
		const user = { id: currentUserId, email, emailVerified: true };
		profileService.completeEmailChange.mockResolvedValue({ success: true, user });

		const response = await app().request("/profile/email/verify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, otp }),
		});

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ user });
		expect(profileService.completeEmailChange).toHaveBeenCalledWith(
			currentUserId,
			email,
			"verification_1"
		);
	});

	it("returns Better Auth password errors in the profile route error shape", async () => {
		changePassword.mockResolvedValue(
			new Response(JSON.stringify({ message: "Invalid password" }), { status: 400 })
		);

		const response = await app().request("/profile", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				currentPassword: "wrong-password",
				newPassword: "new-password",
			}),
		});

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({ error: { message: "Invalid password" } });
	});

	it("validates and updates avatars", async () => {
		const missing = await app().request("/profile/avatar", {
			method: "POST",
			body: JSON.stringify({}),
		});
		const user = { id: currentUserId, image: "https://example.com/avatar.png" };
		profileService.updateUserAvatar.mockResolvedValue({ success: true, user });
		const updated = await app().request("/profile/avatar", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ imageUrl: user.image }),
		});

		expect(missing.status).toBe(400);
		expect(await json(missing)).toEqual({ error: { message: "Image URL is required" } });
		expect(updated.status).toBe(200);
		expect(await json(updated)).toEqual({ user });
		expect(profileService.updateUserAvatar).toHaveBeenCalledWith(currentUserId, user.image);
	});
});
