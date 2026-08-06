import type { UserProfile } from "@slidesage/types";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, users, verifications } from "@/database";
import { logSafeError } from "../utils/safe-logging";

type EditableProfileFields = Partial<
	Pick<typeof users.$inferInsert, "name" | "email" | "emailVerified">
>;

type UpdateProfileDetails = {
	name?: string;
};

type ProfileMutationResult =
	| { success: true; user: UserProfile }
	| { success: false; error: string };

type AvatarMutationResult =
	| { success: true; user: Pick<UserProfile, "id" | "image"> }
	| { success: false; error: string };

function toUserProfile(user: typeof users.$inferSelect): UserProfile {
	return {
		id: user.id,
		name: user.name,
		email: user.email,
		image: user.image,
		emailVerified: user.emailVerified,
		slideTokens: user.slideTokens,
		createdAt: user.createdAt.toISOString(),
	};
}

function getEmailOTPIdentifiers(email: string): string[] {
	const normalizedEmail = email.trim().toLowerCase();
	return [
		`email-verification-otp-${normalizedEmail}`,
		`sign-in-otp-${normalizedEmail}`,
		`forget-password-otp-${normalizedEmail}`,
	];
}

/**
 * Get user profile
 */
export async function getUserProfile(userId: string): Promise<ProfileMutationResult> {
	try {
		const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

		if (!user) {
			return { success: false, error: "User not found" };
		}

		return {
			success: true,
			user: toUserProfile(user),
		};
	} catch (error) {
		logSafeError("profile_read_failed", error);
		return {
			success: false,
			error: "Failed to get profile",
		};
	}
}

/**
 * Update user profile details.
 */
export async function updateUserProfile(
	userId: string,
	data: UpdateProfileDetails
): Promise<ProfileMutationResult> {
	try {
		return await db.transaction(async (tx) => {
			const user = await tx.query.users.findFirst({
				where: eq(users.id, userId),
			});

			if (!user) {
				return { success: false, error: "User not found" };
			}

			const updates: EditableProfileFields = {};
			if (data.name?.trim()) {
				updates.name = data.name.trim();
			}

			if (Object.keys(updates).length === 0) {
				return { success: false, error: "No updates provided" };
			}

			const [updatedUser] = await tx
				.update(users)
				.set(updates)
				.where(eq(users.id, userId))
				.returning();

			if (!updatedUser) {
				return { success: false, error: "Failed to update profile" };
			}

			return {
				success: true,
				user: toUserProfile(updatedUser),
			};
		});
	} catch (error) {
		logSafeError("profile_update_failed", error);
		return {
			success: false,
			error: "Failed to update profile",
		};
	}
}

export async function completeEmailChange(
	userId: string,
	normalizedEmail: string,
	verificationId: string
): Promise<ProfileMutationResult> {
	try {
		return await db.transaction(async (tx) => {
			await tx.execute(
				sql`SELECT pg_advisory_xact_lock(hashtextextended(${`email-change-otp-${userId}`}, 0))`
			);
			const user = await tx.query.users.findFirst({ where: eq(users.id, userId) });
			if (!user) return { success: false, error: "User not found" };

			const existingUser = await tx.query.users.findFirst({
				where: eq(users.email, normalizedEmail),
			});
			if (existingUser && existingUser.id !== userId) {
				return { success: false, error: "Email already in use" };
			}

			const [consumedVerification] = await tx
				.delete(verifications)
				.where(
					and(
						eq(verifications.id, verificationId),
						eq(verifications.identifier, `email-change-otp-${userId}-${normalizedEmail}`),
						gt(verifications.expiresAt, new Date())
					)
				)
				.returning({ id: verifications.id });
			if (!consumedVerification) {
				return { success: false, error: "Verification code is invalid or expired" };
			}

			const [updatedUser] = await tx
				.update(users)
				.set({ email: normalizedEmail, emailVerified: true })
				.where(eq(users.id, userId))
				.returning();
			if (!updatedUser) return { success: false, error: "Failed to update email" };

			const staleIdentifiers = Array.from(
				new Set([...getEmailOTPIdentifiers(user.email), ...getEmailOTPIdentifiers(normalizedEmail)])
			);
			await tx.delete(verifications).where(inArray(verifications.identifier, staleIdentifiers));

			return { success: true, user: toUserProfile(updatedUser) };
		});
	} catch (error) {
		logSafeError("profile_email_change_failed", error);
		return {
			success: false,
			error: "Failed to update email",
		};
	}
}

/**
 * Update user profile image/avatar
 */
export async function updateUserAvatar(
	userId: string,
	imageUrl: string
): Promise<AvatarMutationResult> {
	try {
		const trimmedImageUrl = imageUrl.trim();
		if (!trimmedImageUrl) {
			return { success: false, error: "Image URL is required" };
		}
		if (trimmedImageUrl.length > 2048) {
			return { success: false, error: "Image URL must be 2048 characters or fewer" };
		}
		if (
			Array.from(trimmedImageUrl).some((character) => {
				const code = character.charCodeAt(0);
				return code <= 31 || code === 127;
			})
		) {
			return { success: false, error: "Image URL contains invalid characters" };
		}

		let parsedImageUrl: URL;
		try {
			parsedImageUrl = new URL(trimmedImageUrl);
		} catch {
			return { success: false, error: "Image URL must be a valid HTTPS URL" };
		}
		if (parsedImageUrl.protocol !== "https:") {
			return { success: false, error: "Image URL must use HTTPS" };
		}
		if (parsedImageUrl.username || parsedImageUrl.password) {
			return { success: false, error: "Image URL must not include credentials" };
		}

		const result = await db
			.update(users)
			.set({ image: trimmedImageUrl })
			.where(eq(users.id, userId))
			.returning();

		const updatedUser = result[0];
		if (!updatedUser) {
			return { success: false, error: "Failed to update avatar" };
		}

		return {
			success: true,
			user: {
				id: updatedUser.id,
				image: updatedUser.image,
			},
		};
	} catch (error) {
		logSafeError("profile_avatar_update_failed", error);
		return {
			success: false,
			error: "Failed to update avatar",
		};
	}
}
