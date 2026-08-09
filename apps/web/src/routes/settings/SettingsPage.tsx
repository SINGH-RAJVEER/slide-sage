import Header from "@/app/Header";
import { AISettings } from "@/routes/settings/AISettings";

export default function SettingsPage() {
	return (
		<div className="flex min-h-screen flex-col bg-transparent">
			<Header />
			<main className="flex-1 px-4 py-8 md:px-8 md:py-12">
				<div className="mx-auto w-full max-w-3xl">
					<AISettings />
				</div>
			</main>
		</div>
	);
}
