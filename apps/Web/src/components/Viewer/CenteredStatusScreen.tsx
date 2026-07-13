import { LoadingScreen } from "@/components/ui/loading-screen";

export function CenteredStatusScreen({ message }: { message: string }) {
    return <LoadingScreen label={message} />;
}
