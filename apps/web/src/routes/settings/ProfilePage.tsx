import type {
	ApiErrorResponse,
	ProfileAvatarResponse,
	ProfileResponse,
	UpdateAvatarRequest,
	UpdateProfileRequest,
	UserProfile,
} from "@slidesage/types";
import { useAuth } from "@slidesage/ui";
import { Button } from "@slidesage/ui/components/button";
import { LoadingScreen } from "@slidesage/ui/components/loading-screen";
import { FloatingSettingsNotice } from "@slidesage/ui/components/Settings/FloatingSettingsNotice";
import { ThinkingOrb } from "@slidesage/ui/components/thinking-orb";
import { API_URL, readJsonResponse } from "@slidesage/ui/lib/api";
import { FolderOpen } from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/app/Header";
import { ROUTES } from "@/app/router/paths";

const AVATAR_URL_DEBOUNCE_MS = 800;
const MAX_AVATAR_UPLOAD_BYTES = 800 * 1024;

function isValidAvatarUrl(value: string): boolean {
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
}

export default function ProfilePage() {
	const { refreshSession } = useAuth();
	const navigate = useNavigate();
	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	// Form states
	const [editingName, setEditingName] = useState(false);
	const [newName, setNewName] = useState("");

	const [editingEmail, setEditingEmail] = useState(false);
	const [newEmail, setNewEmail] = useState("");
	const [emailCurrentPassword, setEmailCurrentPassword] = useState("");

	const [editingPassword, setEditingPassword] = useState(false);
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");

	const [imageUrl, setImageUrl] = useState("");
	const [uploadingImage, setUploadingImage] = useState(false);
	const avatarUrlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const avatarRequest = useRef<AbortController | null>(null);
	const avatarRevision = useRef(0);
	const savedImage = useRef("");
	const fileInput = useRef<HTMLInputElement>(null);

	const [savingProfile, setSavingProfile] = useState(false);

	// Fetch profile on mount
	const fetchProfile = useCallback(async () => {
		try {
			setLoading(true);
			const res = await fetch(`${API_URL}/profile`, {
				credentials: "include",
			});

			if (!res.ok) {
				throw new Error("Failed to load profile");
			}

			const data = (await res.json()) as ProfileResponse;
			setProfile(data.user);
			setNewName(data.user.name || "");
			setNewEmail(data.user.email);
			setImageUrl(data.user.image || "");
			savedImage.current = data.user.image || "";
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load profile");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void fetchProfile();
	}, [fetchProfile]);

	useEffect(() => {
		const handlePointsUpdated = (event: Event) => {
			const slideTokens = (event as CustomEvent<{ slideTokens?: unknown }>).detail?.slideTokens;
			if (typeof slideTokens !== "number" || !Number.isFinite(slideTokens)) return;

			setProfile((currentProfile) =>
				currentProfile
					? {
							...currentProfile,
							slideTokens,
						}
					: currentProfile,
			);
		};

		window.addEventListener("slidesage:points-updated", handlePointsUpdated);
		return () => {
			window.removeEventListener("slidesage:points-updated", handlePointsUpdated);
		};
	}, []);

	const handleUpdateName = async (event: FormEvent) => {
		event.preventDefault();
		setSavingProfile(true);
		setError(null);
		setSuccess(null);

		try {
			const res = await fetch(`${API_URL}/profile`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ name: newName } satisfies UpdateProfileRequest),
			});

			if (!res.ok) {
				const data = (await res.json()) as ApiErrorResponse;
				throw new Error(data.error?.message || "Failed to update name");
			}

			const data = (await res.json()) as ProfileResponse;
			setProfile(data.user);
			await refreshSession({ force: true });
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
			const res = await fetch(`${API_URL}/profile`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					email: newEmail,
					currentPassword: emailCurrentPassword,
				} satisfies UpdateProfileRequest),
			});

			if (!res.ok) {
				const data = (await res.json()) as ApiErrorResponse;
				throw new Error(data.error?.message || "Failed to update email");
			}

			const data = (await res.json()) as ProfileResponse & {
				pending_email?: string;
				verification_required?: boolean;
			};
			setProfile(data.user);
			setEditingEmail(false);
			setEmailCurrentPassword("");
			if (data.verification_required && data.pending_email) {
				navigate(
					`/sign-up/verify-email?email=${encodeURIComponent(data.pending_email)}&redirect_url=${encodeURIComponent(ROUTES.profile)}&mode=email-change`,
				);
				return;
			}

			await refreshSession({ force: true });
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
			const res = await fetch(`${API_URL}/profile`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					currentPassword,
					newPassword,
				} satisfies UpdateProfileRequest),
			});

			if (!res.ok) {
				const data = (await res.json()) as ApiErrorResponse;
				throw new Error(data.error?.message || "Failed to update password");
			}

			await refreshSession({ force: true });
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

	const cancelAvatarUpdate = () => {
		if (avatarUrlTimer.current) {
			clearTimeout(avatarUrlTimer.current);
			avatarUrlTimer.current = null;
		}
		avatarRevision.current += 1;
		avatarRequest.current?.abort();
		avatarRequest.current = null;
		setUploadingImage(false);
		return avatarRevision.current;
	};

	const applyAvatarUpdate = async (endpoint: string, init: RequestInit, revision: number) => {
		const controller = new AbortController();
		avatarRequest.current = controller;
		setUploadingImage(true);
		setError(null);
		setSuccess(null);

		try {
			const response = await fetch(`${API_URL}${endpoint}`, {
				...init,
				credentials: "include",
				signal: controller.signal,
			});
			if (!response.ok) {
				const data = await readJsonResponse<ApiErrorResponse>(response);
				throw new Error(data?.error?.message || "Failed to update profile picture");
			}

			const data = await readJsonResponse<ProfileAvatarResponse>(response);
			if (!data?.user || revision !== avatarRevision.current) return;

			savedImage.current = data.user.image || "";
			setImageUrl(data.user.image || "");
			setProfile((currentProfile) =>
				currentProfile ? { ...currentProfile, ...data.user } : currentProfile,
			);
			await refreshSession({ force: true });
			if (revision === avatarRevision.current) setSuccess("Profile picture updated");
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") return;
			if (revision === avatarRevision.current) {
				setError(err instanceof Error ? err.message : "Failed to update profile picture");
			}
		} finally {
			if (avatarRequest.current === controller) avatarRequest.current = null;
			if (revision === avatarRevision.current) setUploadingImage(false);
		}
	};

	const handleImageUrlChange = (value: string) => {
		const revision = cancelAvatarUpdate();
		setImageUrl(value);
		setError(null);
		setSuccess(null);

		const trimmed = value.trim();
		if (!trimmed || trimmed === savedImage.current || !isValidAvatarUrl(trimmed)) return;

		avatarUrlTimer.current = setTimeout(() => {
			avatarUrlTimer.current = null;
			void applyAvatarUpdate(
				"/profile/avatar",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ imageUrl: trimmed } satisfies UpdateAvatarRequest),
				},
				revision,
			);
		}, AVATAR_URL_DEBOUNCE_MS);
	};

	const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;

		const revision = cancelAvatarUpdate();
		setError(null);
		setSuccess(null);
		if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
			setError("Image must be smaller than 800 KB");
			return;
		}

		const formData = new FormData();
		formData.append("file", file);
		void applyAvatarUpdate("/profile/avatar/upload", { method: "POST", body: formData }, revision);
	};

	useEffect(() => {
		return () => {
			if (avatarUrlTimer.current) clearTimeout(avatarUrlTimer.current);
			avatarRevision.current += 1;
			avatarRequest.current?.abort();
		};
	}, []);

	if (loading) {
		return <LoadingScreen label="Loading profile" />;
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
			<FloatingSettingsNotice error={null} success={success} onDismiss={() => setSuccess(null)} />
			<div className="flex-1 px-4 py-6 md:px-8 md:py-8">
				<div className="mx-auto w-full max-w-2xl space-y-4">
					{/* Error Alert */}
					{error ? (
						<div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
							{error}
						</div>
					) : null}

					{/* Avatar Section */}
					<div className="space-y-4 pb-8">
						<h2 className="text-lg font-semibold text-white">Profile Picture</h2>

						{profile.image ? (
							<div className="flex justify-center">
								<img
									src={profile.image}
									alt="Profile"
									className="size-32 rounded-full border border-white/20 object-cover"
								/>
							</div>
						) : (
							<div className="mx-auto flex size-32 items-center justify-center rounded-full border border-white/20 bg-white/10">
								<span className="text-white/40 text-2xl">👤</span>
							</div>
						)}

						<div className="space-y-2">
							<label htmlFor="avatar-url" className="text-sm font-medium text-white/80">
								Image URL
							</label>
							<div className="flex items-center gap-2">
								<input
									id="avatar-url"
									type="url"
									value={imageUrl}
									onChange={(event) => handleImageUrlChange(event.target.value)}
									placeholder="https://example.com/image.jpg"
									aria-busy={uploadingImage}
									className="min-w-0 flex-1 rounded-lg bg-white/10 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
								/>
								<Button
									type="button"
									variant="outline"
									size="icon"
									aria-label="Upload profile picture from your device"
									title="Upload from device"
									disabled={uploadingImage}
									onClick={() => fileInput.current?.click()}
									className="h-12 w-12 shrink-0 border-white/15 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
								>
									{uploadingImage ? (
										<ThinkingOrb size={20} aria-hidden />
									) : (
										<FolderOpen aria-hidden />
									)}
								</Button>
							</div>
							<input
								ref={fileInput}
								id="avatar-file"
								type="file"
								accept="image/png,image/jpeg,image/webp,image/gif"
								className="hidden"
								onChange={handleAvatarFileChange}
							/>
							<p className="text-xs text-white/50" aria-live="polite">
								{uploadingImage
									? "Updating profile picture..."
									: "Paste an HTTPS link or pick a PNG, JPEG, WebP, or GIF up to 800 KB. Changes save automatically."}
							</p>
						</div>
					</div>

					{/* Name Section */}
					<div className="border-t border-white/10 py-8">
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
					<div className="border-t border-white/10 py-8">
						<div className="flex items-center justify-between mb-4">
							<div>
								<h2 className="text-lg font-semibold text-white">Email</h2>
								{profile.emailVerified ? (
									<p className="text-xs text-green-400/80 mt-1">✓ Verified</p>
								) : (
									<p className="text-xs text-yellow-400/80 mt-1">⚠ Not verified</p>
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
									<input
										type="password"
										autoComplete="current-password"
										value={emailCurrentPassword}
										onChange={(event) => setEmailCurrentPassword(event.target.value)}
										className="w-full rounded-lg bg-white/10 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
										placeholder="Current password"
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
											setEmailCurrentPassword("");
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
					<div className="border-t border-white/10 py-8">
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
									<label htmlFor="current-password" className="text-sm font-medium text-white/80">
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
									<label htmlFor="new-password" className="text-sm font-medium text-white/80">
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
					<div className="border-t border-white/10 py-8">
						<h2 className="mb-4 text-lg font-semibold text-white">Account Information</h2>

						<div className="space-y-3">
							<div className="flex justify-between items-center">
								<span className="text-white/60">Points</span>
								<span className="text-white font-semibold">
									{profile.slideTokens?.toFixed(1) ?? "0.0"}
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
