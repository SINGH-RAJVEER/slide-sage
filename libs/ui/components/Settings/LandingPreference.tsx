import type { LandingPage } from "@slidesage/types";
import { FloatingSettingsNotice } from "@slidesage/ui/components/Settings/FloatingSettingsNotice";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@slidesage/ui/components/select";
import { useEffect, useState } from "react";

const LANDING_PAGE_OPTIONS: Array<{ id: LandingPage; label: string }> = [
	{ id: "generate", label: "Generate" },
	{ id: "presentations", label: "Presentations" },
];

interface LandingPreferenceProps {
	value: LandingPage | undefined;
	onSave: (landingPage: LandingPage) => Promise<void>;
}

export function LandingPreference({ value, onSave }: LandingPreferenceProps) {
	const [busy, setBusy] = useState(false);
	const [optimistic, setOptimistic] = useState<LandingPage | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		return () => {
			setError(null);
			setMessage(null);
		};
	}, []);

	const change = async (landingPage: LandingPage) => {
		if (landingPage === optimistic || landingPage === value) return;
		setBusy(true);
		setError(null);
		setMessage(null);
		setOptimistic(landingPage);
		try {
			await onSave(landingPage);
			setMessage("Default page updated.");
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : String(saveError));
		} finally {
			setOptimistic(null);
			setBusy(false);
		}
	};

	return (
		<section>
			<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
				Default page
			</div>
			<h2 className="mt-2 text-lg font-semibold text-white">Where signing in takes you</h2>
			<Select
				value={optimistic ?? value}
				disabled={busy}
				onValueChange={(landingPage) => void change(landingPage as LandingPage)}
			>
				<SelectTrigger
					aria-label="Default landing page"
					className="mt-4 h-10 w-full border-white/10 bg-black/20 text-white/80 sm:w-72"
				>
					<SelectValue placeholder="Select default page" />
				</SelectTrigger>
				<SelectContent className="border-white/10 bg-gray-900 text-white">
					{LANDING_PAGE_OPTIONS.map((option) => (
						<SelectItem key={option.id} value={option.id}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{message ? (
				<p role="status" className="mt-3 text-sm text-white/70">
					{message}
				</p>
			) : null}
			<FloatingSettingsNotice error={error} onDismiss={() => setError(null)} />
		</section>
	);
}
