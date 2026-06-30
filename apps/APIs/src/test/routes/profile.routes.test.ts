import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const currentUserId = "user_1";

const profileService = {
    getUserProfile: mock(),
    updateUserAvatar: mock(),
    updateUserProfile: mock(),
};

mock.module("@slide-sage/auth", () => ({
    authMiddleware: async (
        c: { set: (key: string, value: string) => void },
        next: () => Promise<void>
    ) => {
        c.set("userId", currentUserId);
        await next();
    },
    getCurrentUserId: () => currentUserId,
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
        profileService.updateUserAvatar.mockReset();
        profileService.updateUserProfile.mockReset();
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
            email: undefined,
            currentPassword: undefined,
            newPassword: undefined,
        });
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
