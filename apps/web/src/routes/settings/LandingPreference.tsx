import type { LandingPage } from "@slidesage/types";
import { useAuth } from "@slidesage/ui";
import { LandingPreference as LandingPreferenceView } from "@slidesage/ui/components/Settings/LandingPreference";
import { API_URL, readJsonResponse } from "@slidesage/ui/lib/api";

export function LandingPreference() {
	const { user, refreshSession } = useAuth();

	const saveLandingPage = async (landingPage: LandingPage) => {
		const response = await fetch(`${API_URL}/profile`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ landingPage }),
		});
		if (!response.ok) {
			const result = await readJsonResponse<{ error?: { message?: string } }>(response);
			throw new Error(result?.error?.message || "Failed to update the default page");
		}
		await refreshSession({ force: true });
	};

	return <LandingPreferenceView value={user?.landingPage} onSave={saveLandingPage} />;
}
