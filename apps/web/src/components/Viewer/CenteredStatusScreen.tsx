import { LoadingScreen } from "@slide-sage/ui/components/loading-screen";

export function CenteredStatusScreen({ message }: { message: string }) {
    return <LoadingScreen label={message} />;
}
