import { authMiddleware, getCurrentUserId } from "@slide-sage/auth";
import { Hono } from "hono";
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

        return c.json({ user: result.user });
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
        const body = await c.req.json().catch(() => ({}));

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

        return c.json({ user: result.user });
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
        const body = await c.req.json().catch(() => ({}));

        const { imageUrl } = body;

        if (!imageUrl) {
            return c.json({ error: { message: "Image URL is required" } }, 400);
        }

        const result = await updateUserAvatar(userId, imageUrl);

        if (!result.success) {
            return c.json({ error: { message: result.error } }, 400);
        }

        return c.json({ user: result.user });
    } catch (error) {
        console.error("Update avatar error:", error);
        return c.json({ error: { message: "Internal server error" } }, 500);
    }
});

export default profileRoutes;
