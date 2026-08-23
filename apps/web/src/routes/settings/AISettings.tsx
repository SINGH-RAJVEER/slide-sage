import { AISettings as AISettingsView } from "@slidesage/ui/components/Settings/AISettings";
import {
	connectAIProvider,
	deleteAIProvider,
	fetchAIConfiguration,
	selectAIModel,
	setAIConnectionEnabled,
} from "@slidesage/ui/lib/ai-connections";

export function AISettings() {
	return (
		<AISettingsView
			fetchConfiguration={fetchAIConfiguration}
			connectProvider={connectAIProvider}
			deleteProvider={deleteAIProvider}
			selectModel={selectAIModel}
			setProviderEnabled={setAIConnectionEnabled}
		/>
	);
}
