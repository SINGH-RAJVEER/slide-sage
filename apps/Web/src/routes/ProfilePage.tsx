import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";

interface UserProfile {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    emailVerified: boolean;
    slideTokens: number;
    isUnlimited: boolean;
    createdAt: string;
}

export default function ProfilePage() {
    const navigate = useNavigate();
    const { isSignedIn } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Form states
    const [editingName, setEditingName] = useState(false);
    const [newName, setNewName] = useState("");

    const [editingEmail, setEditingEmail] = useState(false);
    const [newEmail, setNewEmail] = useState("");

    const [editingPassword, setEditingPassword] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [imageUrl, setImageUrl] = useState("");
    const [uploadingImage, setUploadingImage] = useState(false);

    const [savingProfile, setSavingProfile] = useState(false);

    // Redirect if not signed in
    useEffect(() => {
        if (!isSignedIn) {
            navigate("/sign-in");
        }
    }, [isSignedIn, navigate]);

    // Fetch profile on mount
    const fetchProfile = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/profile", {
                credentials: "include",
            });

            if (!res.ok) {
                throw new Error("Failed to load profile");
            }

            const data = await res.json();
            setProfile(data.user);
            setNewName(data.user.name || "");
            setNewEmail(data.user.email);
            setImageUrl(data.user.image || "");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load profile");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchProfile();
    }, [fetchProfile]);

    const handleUpdateName = async (event: FormEvent) => {
        event.preventDefault();
        setSavingProfile(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch("/api/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ name: newName }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error?.message || "Failed to update name");
            }

            const data = await res.json();
            setProfile(data.user);
            setEditingName(false);
            setSuccess("Name updated successfully");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update name");
        } finally {
            setSavingProfile(false);
        }
    };

    const handleUpdateEmail = async (event: FormEvent) => {
        event.preventDefault();
        setSavingProfile(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch("/api/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email: newEmail }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error?.message || "Failed to update email");
            }

            const data = await res.json();
            setProfile(data.user);
            setEditingEmail(false);
            setSuccess("Email updated successfully");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update email");
        } finally {
            setSavingProfile(false);
        }
    };

    const handleUpdatePassword = async (event: FormEvent) => {
        event.preventDefault();
        setSavingProfile(true);
        setError(null);
        setSuccess(null);

        if (newPassword !== confirmPassword) {
            setError("Passwords do not match");
            setSavingProfile(false);
            return;
        }

        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters");
            setSavingProfile(false);
            return;
        }

        try {
            const res = await fetch("/api/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    currentPassword,
                    newPassword,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error?.message || "Failed to update password");
            }

            setEditingPassword(false);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setSuccess("Password updated successfully");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update password");
        } finally {
            setSavingProfile(false);
        }
    };

    const handleUpdateAvatar = async (event: FormEvent) => {
        event.preventDefault();
        setUploadingImage(true);
        setError(null);
        setSuccess(null);

        if (!imageUrl.trim()) {
            setError("Please enter an image URL");
            setUploadingImage(false);
            return;
        }

        try {
            const res = await fetch("/api/profile/avatar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ imageUrl: imageUrl.trim() }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error?.message || "Failed to update avatar");
            }

            const data = await res.json();
            setProfile(data.user);
            setSuccess("Avatar updated successfully");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update avatar");
        } finally {
            setUploadingImage(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-transparent flex flex-col">
                <Header />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-white/60">Loading profile...</div>
                </div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="min-h-screen bg-transparent flex flex-col">
                <Header />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-white/60">Profile not found</div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-transparent flex flex-col">
            <Header />
            <div className="flex-1 px-4 py-6 md:px-8 md:py-8">
                <div className="mx-auto w-full max-w-2xl space-y-4">
                    {/* Success Alert */}
                    {success ? (
                        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-100">
                            ✓ {success}
                        </div>
                    ) : null}

                    {/* Error Alert */}
                    {error ? (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                            {error}
                        </div>
                    ) : null}

                    {/* Profile Header */}
                    <div className="rounded-xl border border-white/10 bg-black/20 p-6">
                        <h1 className="mb-1 text-2xl font-semibold text-white">My profile</h1>
                        <p className="text-white/65">
                            Manage your account settings and preferences
                        </p>
                    </div>

                    {/* Avatar Section */}
                    <div className="space-y-4 rounded-xl border border-white/10 bg-black/20 p-6">
                        <h2 className="text-lg font-semibold text-white">Profile Picture</h2>

                        {profile.image ? (
                            <div className="flex gap-4 items-start">
                                <img
                                    src={profile.image}
                                    alt="Profile"
                                    className="w-24 h-24 rounded-full object-cover border border-white/20"
                                />
                                <div className="flex-1">
                                    <p className="text-white/60 text-sm mb-2">
                                        Current profile picture
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="w-24 h-24 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                                <span className="text-white/40 text-2xl">👤</span>
                            </div>
                        )}

                        <form className="space-y-4" onSubmit={handleUpdateAvatar}>
                            <div className="space-y-2">
                                <label
                                    htmlFor="avatar-url"
                                    className="text-sm font-medium text-white/80"
                                >
                                    Image URL
                                </label>
                                <input
                                    id="avatar-url"
                                    type="url"
                                    value={imageUrl}
                                    onChange={(e) => setImageUrl(e.target.value)}
                                    placeholder="https://example.com/image.jpg"
                                    className="w-full rounded-lg bg-white/10 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                                />
                                <p className="text-xs text-white/50">
                                    Paste a link to your profile picture
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={uploadingImage}
                                className="w-full bg-white text-black font-semibold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-60"
                            >
                                {uploadingImage ? "Uploading..." : "Update Picture"}
                            </button>
                        </form>
                    </div>

                    {/* Name Section */}
                    <div className="rounded-xl border border-white/10 bg-black/20 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-white">Full name</h2>
                            {!editingName ? (
                                <button
                                    type="button"
                                    onClick={() => setEditingName(true)}
                                    className="text-sm text-white/60 hover:text-white transition"
                                >
                                    Edit
                                </button>
                            ) : null}
                        </div>

                        {editingName ? (
                            <form className="space-y-4" onSubmit={handleUpdateName}>
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="w-full rounded-lg bg-white/10 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                                        placeholder="Your name"
                                        required
                                    />
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={savingProfile}
                                        className="flex-1 bg-white text-black font-semibold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-60"
                                    >
                                        {savingProfile ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingName(false);
                                            setNewName(profile.name || "");
                                        }}
                                        className="flex-1 bg-white/10 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 hover:bg-white/20"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <p className="text-white/80">{profile.name || "Not set"}</p>
                        )}
                    </div>

                    {/* Email Section */}
                    <div className="rounded-xl border border-white/10 bg-black/20 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-lg font-semibold text-white">Email</h2>
                                {profile.emailVerified ? (
                                    <p className="text-xs text-green-400/80 mt-1">✓ Verified</p>
                                ) : (
                                    <p className="text-xs text-yellow-400/80 mt-1">
                                        ⚠ Not verified
                                    </p>
                                )}
                            </div>
                            {!editingEmail ? (
                                <button
                                    type="button"
                                    onClick={() => setEditingEmail(true)}
                                    className="text-sm text-white/60 hover:text-white transition"
                                >
                                    Edit
                                </button>
                            ) : null}
                        </div>

                        {editingEmail ? (
                            <form className="space-y-4" onSubmit={handleUpdateEmail}>
                                <div className="space-y-2">
                                    <input
                                        type="email"
                                        value={newEmail}
                                        onChange={(e) => setNewEmail(e.target.value)}
                                        className="w-full rounded-lg bg-white/10 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                                        placeholder="your@email.com"
                                        required
                                    />
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={savingProfile}
                                        className="flex-1 bg-white text-black font-semibold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-60"
                                    >
                                        {savingProfile ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingEmail(false);
                                            setNewEmail(profile.email);
                                        }}
                                        className="flex-1 bg-white/10 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 hover:bg-white/20"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <p className="text-white/80">{profile.email}</p>
                        )}
                    </div>

                    {/* Password Section */}
                    <div className="rounded-xl border border-white/10 bg-black/20 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-white">Password</h2>
                            {!editingPassword ? (
                                <button
                                    type="button"
                                    onClick={() => setEditingPassword(true)}
                                    className="text-sm text-white/60 hover:text-white transition"
                                >
                                    Change
                                </button>
                            ) : null}
                        </div>

                        {editingPassword ? (
                            <form className="space-y-4" onSubmit={handleUpdatePassword}>
                                <div className="space-y-2">
                                    <label
                                        htmlFor="current-password"
                                        className="text-sm font-medium text-white/80"
                                    >
                                        Current Password
                                    </label>
                                    <input
                                        id="current-password"
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="w-full rounded-lg bg-white/10 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                                        placeholder="Enter current password"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="new-password"
                                        className="text-sm font-medium text-white/80"
                                    >
                                        New Password
                                    </label>
                                    <input
                                        id="new-password"
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full rounded-lg bg-white/10 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                                        placeholder="Enter new password (min 8 chars)"
                                        minLength={8}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="confirm-new-password"
                                        className="text-sm font-medium text-white/80"
                                    >
                                        Confirm Password
                                    </label>
                                    <input
                                        id="confirm-new-password"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full rounded-lg bg-white/10 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                                        placeholder="Confirm new password"
                                        minLength={8}
                                        required
                                    />
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={savingProfile}
                                        className="flex-1 bg-white text-black font-semibold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-60"
                                    >
                                        {savingProfile ? "Updating..." : "Update Password"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingPassword(false);
                                            setCurrentPassword("");
                                            setNewPassword("");
                                            setConfirmPassword("");
                                        }}
                                        className="flex-1 bg-white/10 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 hover:bg-white/20"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <p className="text-white/80">••••••••</p>
                        )}
                    </div>

                    {/* Account Info */}
                    <div className="rounded-xl border border-white/10 bg-black/20 p-6">
                        <h2 className="mb-4 text-lg font-semibold text-white">
                            Account Information
                        </h2>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-white/60">Slide Tokens</span>
                                <span className="text-white font-semibold">
                                    {profile.isUnlimited ? "Unlimited" : profile.slideTokens}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-white/60">Account Created</span>
                                <span className="text-white font-semibold">
                                    {new Date(profile.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
