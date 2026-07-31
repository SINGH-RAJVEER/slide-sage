import { AISettings as AISettingsView } from "@slide-sage/ui/components/Settings/AISettings";
import {
    connectAIProvider,
    deleteAIProvider,
    fetchAIConfiguration,
    selectAIModel,
} from "@/lib/ai-connections";

export function AISettings() {
    return (
        <AISettingsView
            fetchConfiguration={fetchAIConfiguration}
            connectProvider={connectAIProvider}
            deleteProvider={deleteAIProvider}
            selectModel={selectAIModel}
        />
    );
}
