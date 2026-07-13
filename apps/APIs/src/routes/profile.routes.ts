import type {
    ProfileAvatarResponse,
    ProfileResponse,
    UpdateAvatarRequest,
    UpdateProfileRequest,
} from "@slide-sage/types";
import { Hono } from "hono";
import { authMiddleware, getCurrentUserId } from "../services/auth";
import { getUserProfile, updateUserAvatar, updateUserProfile } from "../services/profile.service";

const profileRoutes = new Hono();

// All profile routes require authentication
profileRoutes.use("*", authMiddleware);

/**
 * GET /api/profile
 * Get current user's profile
 */
profileRoutes.get("/", async (c) => {
    try {
        const userId = getCurrentUserId(c);
        const result = await getUserProfile(userId);

        if (!result.success) {
            return c.json({ error: { message: result.error } }, 400);
        }

        return c.json({ user: result.user } satisfies ProfileResponse);
    } catch (error) {
        console.error("Profile route error:", error);
        return c.json({ error: { message: "Internal server error" } }, 500);
    }
});

/**
 * PUT /api/profile
 * Update user profile (name, email, password)
 */
profileRoutes.put("/", async (c) => {
    try {
        const userId = getCurrentUserId(c);
        const body = (await c.req.json().catch(() => ({}))) as UpdateProfileRequest;

        const { name, email, currentPassword, newPassword } = body;

        if (!name && !email && !newPassword) {
            return c.json({ error: { message: "Nothing to update" } }, 400);
        }

        const result = await updateUserProfile(userId, {
            name,
            email,
            currentPassword,
            newPassword,
        });

        if (!result.success) {
            return c.json({ error: { message: result.error } }, 400);
        }

        return c.json({ user: result.user } satisfies ProfileResponse);
    } catch (error) {
        console.error("Update profile error:", error);
        return c.json({ error: { message: "Internal server error" } }, 500);
    }
});

/**
 * POST /api/profile/avatar
 * Update user's profile avatar/image
 */
profileRoutes.post("/avatar", async (c) => {
    try {
        const userId = getCurrentUserId(c);
        const body = (await c.req.json().catch(() => ({}))) as Partial<UpdateAvatarRequest>;

        const { imageUrl } = body;

        if (!imageUrl) {
            return c.json({ error: { message: "Image URL is required" } }, 400);
        }

        const result = await updateUserAvatar(userId, imageUrl);

        if (!result.success) {
            return c.json({ error: { message: result.error } }, 400);
        }

        return c.json({ user: result.user } satisfies ProfileAvatarResponse);
    } catch (error) {
        console.error("Update avatar error:", error);
        return c.json({ error: { message: "Internal server error" } }, 500);
    }
});

export default profileRoutes;
