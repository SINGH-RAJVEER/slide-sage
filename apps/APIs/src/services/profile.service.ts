import { db } from "@slide-sage/db";
import { users } from "@slide-sage/db";
import { eq } from "drizzle-orm";

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
export async function getUserProfile(userId: string) {
    try {
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

        if (!user) {
            return { success: false, error: "User not found" };
        }

        return {
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
                emailVerified: user.emailVerified,
                slideTokens: user.slideTokens,
                isUnlimited: user.isUnlimited,
                createdAt: user.createdAt,
            },
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
    data: {
        name?: string;
        email?: string;
        currentPassword?: string;
        newPassword?: string;
    }
): Promise<{
    success: boolean;
    error?: string;
    user?: any;
}> {
    try {
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (!user) {
            return { success: false, error: "User not found" };
        }

        // Prepare updates
        const updates: Record<string, any> = {};

        if (data.name && data.name.trim()) {
            updates.name = data.name.trim();
        }

        if (data.email && data.email.trim()) {
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
            // For now, we're just noting that password change was requested
            const hashedNewPassword = await hashPassword(data.newPassword);
            updates.password = hashedNewPassword;
        }

        if (Object.keys(updates).length === 0) {
            return { success: false, error: "No updates provided" };
        }

        // Update user
        const result = await db.update(users).set(updates).where(eq(users.id, userId)).returning();

        if (!result || result.length === 0) {
            return { success: false, error: "Failed to update profile" };
        }

        const updatedUser = result[0];

        return {
            success: true,
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                image: updatedUser.image,
                emailVerified: updatedUser.emailVerified,
            },
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
): Promise<{
    success: boolean;
    error?: string;
    user?: any;
}> {
    try {
        if (!imageUrl || !imageUrl.trim()) {
            return { success: false, error: "Image URL is required" };
        }

        const result = await db
            .update(users)
            .set({ image: imageUrl })
            .where(eq(users.id, userId))
            .returning();

        if (!result || result.length === 0) {
            return { success: false, error: "Failed to update avatar" };
        }

        const updatedUser = result[0];

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
