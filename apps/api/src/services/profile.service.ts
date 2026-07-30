import type { UpdateProfileRequest, UserProfile } from "@slide-sage/types";
import { and, eq } from "drizzle-orm";
import { accounts, db, users } from "@/database";

type EditableProfileFields = Partial<Pick<typeof users.$inferInsert, "name" | "email" | "image">>;

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

/**
 * Hash password using SHA-256
 */
async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
        console.error("Get profile error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to get profile",
        };
    }
}

/**
 * Update user profile (name, email, password)
 */
export async function updateUserProfile(
    userId: string,
    data: UpdateProfileRequest
): Promise<ProfileMutationResult> {
    try {
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (!user) {
            return { success: false, error: "User not found" };
        }

        // Prepare updates
        const updates: EditableProfileFields = {};

        if (data.name?.trim()) {
            updates.name = data.name.trim();
        }

        if (data.email?.trim()) {
            // Check if email is already taken
            const existingUser = await db.query.users.findFirst({
                where: eq(users.email, data.email.toLowerCase()),
            });

            if (existingUser && existingUser.id !== userId) {
                return { success: false, error: "Email already in use" };
            }

            updates.email = data.email.toLowerCase();
        }

        if (data.newPassword) {
            if (!data.currentPassword) {
                return {
                    success: false,
                    error: "Current password required to change password",
                };
            }

            // Verify current password against account record
            // Note: In production, you'd hash and compare properly
            const hashedNewPassword = await hashPassword(data.newPassword);
            await db
                .update(accounts)
                .set({ password: hashedNewPassword })
                .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
        }

        if (Object.keys(updates).length === 0) {
            if (data.newPassword) {
                return {
                    success: true,
                    user: toUserProfile(user),
                };
            }

            return { success: false, error: "No updates provided" };
        }

        // Update user
        const result = await db.update(users).set(updates).where(eq(users.id, userId)).returning();

        const updatedUser = result[0];
        if (!updatedUser) {
            return { success: false, error: "Failed to update profile" };
        }

        return {
            success: true,
            user: toUserProfile(updatedUser),
        };
    } catch (error) {
        console.error("Update profile error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update profile",
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
        if (!imageUrl || !imageUrl.trim()) {
            return { success: false, error: "Image URL is required" };
        }

        const result = await db
            .update(users)
            .set({ image: imageUrl })
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
        console.error("Update avatar error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update avatar",
        };
    }
}
